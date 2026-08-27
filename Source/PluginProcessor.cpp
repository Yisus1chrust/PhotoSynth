#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace photosynth
{
    namespace
    {
        constexpr float kLimiterThresholdDefault = -3.0f;
        constexpr float kLimiterRatio = 20.0f;
        constexpr float kLimiterAttackMs = 0.5f;

        juce::StringArray engineChoices()
        {
            return { "analog_brass", "digital_fm_bells", "hybrid_wavetable", "acoustic_piano_organ", "overdriven_saw_stack", "fm_square_bell" };
        }
    }

    PhotoSynthAudioProcessor::PhotoSynthAudioProcessor()
      : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)),
        apvts(*this, nullptr, "PARAMS", createParameterLayout())
    {
        masterClipper.functionToUse = [](float x) { return std::tanh(x); };
        scopeBuffer.setSize(2, 2048);
        scopeBuffer.clear();
    }

    bool PhotoSynthAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
    {
        return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
    }

    juce::AudioProcessorValueTreeState::ParameterLayout PhotoSynthAudioProcessor::createParameterLayout()
    {
        using APF = juce::AudioParameterFloat;
        using APB = juce::AudioParameterBool;
        using APC = juce::AudioParameterChoice;

        std::vector<std::unique_ptr<juce::RangedAudioParameter>> p;

        p.push_back(std::make_unique<APF>(juce::ParameterID{"cutoffOffset", 1}, "Cutoff Offset", juce::NormalisableRange<float>(20.0f, 20000.0f, 1.0f, 0.3f), 2500.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"resonance", 1}, "Resonance", juce::NormalisableRange<float>(0.0f, 10.0f, 0.01f), 1.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"lfoRate", 1}, "LFO Rate", juce::NormalisableRange<float>(0.1f, 20.0f, 0.01f), 2.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"lfoDepth", 1}, "LFO Depth", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.2f));

        p.push_back(std::make_unique<APF>(juce::ParameterID{"masterVolume", 1}, "Master Volume", juce::NormalisableRange<float>(-60.0f, 6.0f, 0.01f), -3.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"attackTime", 1}, "Attack", juce::NormalisableRange<float>(0.001f, 5.0f, 0.001f, 0.4f), 0.01f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"decayTime", 1}, "Decay", juce::NormalisableRange<float>(0.01f, 10.0f, 0.001f, 0.4f), 0.8f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"sustainLevel", 1}, "Sustain", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.7f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"releaseTime", 1}, "Release", juce::NormalisableRange<float>(0.01f, 8.0f, 0.001f, 0.4f), 0.4f));
        p.push_back(std::make_unique<APB>(juce::ParameterID{"limiterEnabled", 1}, "Limiter Enabled", true));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"threshold", 1}, "Threshold", juce::NormalisableRange<float>(-30.0f, 0.0f, 0.01f), -3.0f));

        p.push_back(std::make_unique<APC>(juce::ParameterID{"engineType", 1}, "Engine Type", engineChoices(), 2));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"detuneCents", 1}, "Detune Cents", juce::NormalisableRange<float>(-50.0f, 50.0f, 0.01f), 5.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"unisonVoices", 1}, "Unison Voices", juce::NormalisableRange<float>(1.0f, 7.0f, 1.0f), 2.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"fmRatio", 1}, "FM Ratio", juce::NormalisableRange<float>(0.5f, 8.0f, 0.001f), 2.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"fmAmount", 1}, "FM Amount", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.35f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"subOscLevel", 1}, "Sub Osc", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.3f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"reverbMix", 1}, "Reverb Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.35f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"delayMix", 1}, "Delay Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.25f));

        auto addFx = [&p](const juce::String& idPrefix)
        {
            p.push_back(std::make_unique<APB>(juce::ParameterID{ idPrefix + "Enabled", 1 }, idPrefix + " Enabled", true));
            p.push_back(std::make_unique<APF>(juce::ParameterID{ idPrefix + "Intensity", 1 }, idPrefix + " Intensity", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
            p.push_back(std::make_unique<APF>(juce::ParameterID{ idPrefix + "Param1", 1 }, idPrefix + " Param1", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
            p.push_back(std::make_unique<APF>(juce::ParameterID{ idPrefix + "Param2", 1 }, idPrefix + " Param2", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
        };

        addFx("delay");
        addFx("reverb");
        addFx("chorus");
        addFx("phaser");
        addFx("flanger");
        addFx("distortion");

        p.push_back(std::make_unique<APF>(juce::ParameterID{"temporalEraVal", 1}, "Temporal Era", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"opticalFocusDepth", 1}, "Optical Focus", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"gridSymmetryDensity", 1}, "Grid Symmetry", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"lightAzimuthAngle", 1}, "Light Azimuth", juce::NormalisableRange<float>(0.0f, 360.0f, 0.01f), 180.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"lightElevationAngle", 1}, "Light Elevation", juce::NormalisableRange<float>(0.0f, 90.0f, 0.01f), 45.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"chromaticClash", 1}, "Chromatic Clash", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.2f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"semanticDensityWeight", 1}, "Semantic Density", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));

        p.push_back(std::make_unique<APF>(juce::ParameterID{"bodyDamping", 1}, "Body Damping", juce::NormalisableRange<float>(0.05f, 0.95f, 0.001f), 0.3f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"acousticWeight", 1}, "Acoustic Weight", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.25f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"tapeFlutterSpeed", 1}, "Flutter Speed", juce::NormalisableRange<float>(0.1f, 3.0f, 0.001f), 0.8f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"tapeFlutterDepth", 1}, "Flutter Depth", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.08f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"analogSaturationWarmth", 1}, "Analog Warmth", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.3f));

        return { p.begin(), p.end() };
    }

    void PhotoSynthAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
    {
        juce::dsp::ProcessSpec spec { sampleRate, (juce::uint32) samplesPerBlock, 2 };
        synthEngine.prepare(sampleRate, samplesPerBlock, 2);
        physicalModeling.prepare(spec);
        effectsChain.prepare(spec);

        limiter.prepare(spec);
        limiter.setThreshold(kLimiterThresholdDefault);
        limiter.setRatio(kLimiterRatio);
        limiter.setAttack(kLimiterAttackMs);
        limiter.setRelease(80.0f);

        masterClipper.prepare(spec);
        masterGainSmoothed.reset(sampleRate, 0.02);
        masterGainSmoothed.setCurrentAndTargetValue(juce::Decibels::decibelsToGain(-3.0f));

        updatePatchFromParameters();
    }

    void PhotoSynthAudioProcessor::releaseResources() {}

    void PhotoSynthAudioProcessor::updatePatchFromParameters()
    {
        auto getF = [this](const char* id) { return apvts.getRawParameterValue(id)->load(); };

        currentPatch.cutoffOffset = getF("cutoffOffset");
        currentPatch.resonance = getF("resonance");
        currentPatch.lfoRate = getF("lfoRate");
        currentPatch.lfoDepth = getF("lfoDepth");

        currentPatch.masterVolume = getF("masterVolume");
        currentPatch.attackTime = getF("attackTime");
        currentPatch.decayTime = getF("decayTime");
        currentPatch.sustainLevel = getF("sustainLevel");
        currentPatch.releaseTime = getF("releaseTime");
        currentPatch.limiterEnabled = getF("limiterEnabled") > 0.5f;
        currentPatch.threshold = getF("threshold");

        currentPatch.engineType = engineFromFloat(getF("engineType"));
        currentPatch.detuneCents = getF("detuneCents");
        currentPatch.unisonVoices = (int) std::round(getF("unisonVoices"));
        currentPatch.fmRatio = getF("fmRatio");
        currentPatch.fmAmount = getF("fmAmount");
        currentPatch.subOscLevel = getF("subOscLevel");
        currentPatch.reverbMix = getF("reverbMix");
        currentPatch.delayMix = getF("delayMix");

        auto setFx = [this, &getF](const char* prefix, EffectConfig& fx)
        {
            fx.enabled = getF((juce::String(prefix) + "Enabled").toRawUTF8()) > 0.5f;
            fx.intensity = getF((juce::String(prefix) + "Intensity").toRawUTF8());
            fx.param1 = getF((juce::String(prefix) + "Param1").toRawUTF8());
            fx.param2 = getF((juce::String(prefix) + "Param2").toRawUTF8());
        };

        setFx("delay", currentPatch.effects.delay);
        setFx("reverb", currentPatch.effects.reverb);
        setFx("chorus", currentPatch.effects.chorus);
        setFx("phaser", currentPatch.effects.phaser);
        setFx("flanger", currentPatch.effects.flanger);
        setFx("distortion", currentPatch.effects.distortion);

        currentPatch.temporalEraVal = getF("temporalEraVal");
        currentPatch.opticalFocusDepth = getF("opticalFocusDepth");
        currentPatch.gridSymmetryDensity = getF("gridSymmetryDensity");
        currentPatch.lightAzimuthAngle = getF("lightAzimuthAngle");
        currentPatch.lightElevationAngle = getF("lightElevationAngle");
        currentPatch.chromaticClash = getF("chromaticClash");
        currentPatch.semanticDensityWeight = getF("semanticDensityWeight");

        currentPatch.physicalModel.bodyDamping = getF("bodyDamping");
        currentPatch.physicalModel.acousticWeight = getF("acousticWeight");
        currentPatch.physicalModel.tapeFlutterSpeed = getF("tapeFlutterSpeed");
        currentPatch.physicalModel.tapeFlutterDepth = getF("tapeFlutterDepth");
        currentPatch.physicalModel.analogSaturationWarmth = getF("analogSaturationWarmth");

        synthEngine.setPatch(currentPatch);
        synthEngine.setMetrics(currentMetrics);
        physicalModeling.updateFromPatch(currentPatch, getSampleRate());
        effectsChain.updateFromPatch(currentPatch, getSampleRate());

        masterGainSmoothed.setTargetValue(juce::Decibels::decibelsToGain(currentPatch.masterVolume));
    }

    void PhotoSynthAudioProcessor::pushScope(const juce::AudioBuffer<float>& block)
    {
        const juce::ScopedLock sl(scopeLock);
        const int n = juce::jmin(scopeBuffer.getNumSamples(), block.getNumSamples());
        for (int ch = 0; ch < juce::jmin(scopeBuffer.getNumChannels(), block.getNumChannels()); ++ch)
            scopeBuffer.copyFrom(ch, 0, block, ch, block.getNumSamples() - n, n);
    }

    void PhotoSynthAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
    {
        juce::ScopedNoDenormals noDenormals;

        for (int i = getTotalNumInputChannels(); i < getTotalNumOutputChannels(); ++i)
            buffer.clear(i, 0, buffer.getNumSamples());

        keyboardState.processNextMidiBuffer(midiMessages, 0, buffer.getNumSamples(), true);

        updatePatchFromParameters();

        buffer.clear();
        synthEngine.render(buffer, midiMessages);

        physicalModeling.processBlock(buffer);
        effectsChain.processBlock(buffer);

        buffer.applyGainRamp(0, buffer.getNumSamples(), masterGainSmoothed.getCurrentValue(), masterGainSmoothed.getTargetValue());

        limiter.setThreshold(currentPatch.limiterEnabled ? currentPatch.threshold : -0.5f);
        limiter.setRatio(currentPatch.limiterEnabled ? 20.0f : 12.0f);

        juce::dsp::AudioBlock<float> block(buffer);
        juce::dsp::ProcessContextReplacing<float> context(block);
        limiter.process(context);
        masterClipper.process(context);

        pushScope(buffer);
    }

    void PhotoSynthAudioProcessor::loadImageFile(const juce::File& file)
    {
        auto img = juce::ImageFileFormat::loadFrom(file);
        if (img.isNull())
            return;

        const auto result = ImageAnalyzer::analyzeImage(img);
        currentMetrics = result.first;
        currentPatch = result.second;

        auto setF = [this](const char* id, float value)
        {
            if (auto* param = apvts.getParameter(id))
                param->setValueNotifyingHost(param->convertTo0to1(value));
        };

        setF("cutoffOffset", currentPatch.cutoffOffset);
        setF("resonance", currentPatch.resonance);
        setF("lfoRate", currentPatch.lfoRate);
        setF("lfoDepth", currentPatch.lfoDepth);
        setF("attackTime", currentPatch.attackTime);
        setF("decayTime", currentPatch.decayTime);
        setF("sustainLevel", currentPatch.sustainLevel);
        setF("releaseTime", currentPatch.releaseTime);
        setF("detuneCents", currentPatch.detuneCents);
        setF("unisonVoices", (float) currentPatch.unisonVoices);
        setF("fmRatio", currentPatch.fmRatio);
        setF("fmAmount", currentPatch.fmAmount);
        setF("subOscLevel", currentPatch.subOscLevel);
        setF("reverbMix", currentPatch.reverbMix);
        setF("delayMix", currentPatch.delayMix);
        setF("temporalEraVal", currentPatch.temporalEraVal);
        setF("opticalFocusDepth", currentPatch.opticalFocusDepth);
        setF("gridSymmetryDensity", currentPatch.gridSymmetryDensity);
        setF("lightAzimuthAngle", currentPatch.lightAzimuthAngle);
        setF("lightElevationAngle", currentPatch.lightElevationAngle);
        setF("chromaticClash", currentPatch.chromaticClash);
        setF("semanticDensityWeight", currentPatch.semanticDensityWeight);

        if (auto* engineParam = apvts.getParameter("engineType"))
            engineParam->setValueNotifyingHost(engineParam->convertTo0to1((float) currentPatch.engineType));

        updatePatchFromParameters();
    }

    void PhotoSynthAudioProcessor::savePresetToFile(const juce::File& file)
    {
        auto state = apvts.copyState();
        state.setProperty("imageHash", currentMetrics.hash64, nullptr);
        state.setProperty("seedNumber", (juce::int64) currentMetrics.seedNumber, nullptr);

        std::unique_ptr<juce::XmlElement> xml(state.createXml());
        if (xml != nullptr)
            xml->writeTo(file);
    }

    void PhotoSynthAudioProcessor::loadPresetFromFile(const juce::File& file)
    {
        std::unique_ptr<juce::XmlElement> xml(juce::XmlDocument::parse(file));
        if (xml == nullptr)
            return;

        if (xml->hasTagName(apvts.state.getType().toString()))
            apvts.replaceState(juce::ValueTree::fromXml(*xml));

        updatePatchFromParameters();
    }

    void PhotoSynthAudioProcessor::getScopeData(juce::AudioBuffer<float>& target)
    {
        const juce::ScopedLock sl(scopeLock);
        target.makeCopyOf(scopeBuffer, true);
    }

    void PhotoSynthAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
    {
        std::unique_ptr<juce::XmlElement> xml(apvts.copyState().createXml());
        copyXmlToBinary(*xml, destData);
    }

    void PhotoSynthAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
    {
        std::unique_ptr<juce::XmlElement> xml(getXmlFromBinary(data, sizeInBytes));
        if (xml != nullptr && xml->hasTagName(apvts.state.getType()))
            apvts.replaceState(juce::ValueTree::fromXml(*xml));

        updatePatchFromParameters();
    }

    juce::AudioProcessorEditor* PhotoSynthAudioProcessor::createEditor()
    {
        return new PhotoSynthAudioProcessorEditor(*this);
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new photosynth::PhotoSynthAudioProcessor();
}

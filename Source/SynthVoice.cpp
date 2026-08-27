#include "SynthVoice.h"

namespace photosynth
{
    SynthVoice::SynthVoice()
    {
        osc1.initialise([](float x){ return std::sin(x); });
        osc2.initialise([](float x){ return x / juce::MathConstants<float>::pi; });
        subOsc.initialise([](float x){ return x < 0.0f ? -1.0f : 1.0f; });
        fmMod.initialise([](float x){ return std::sin(x); });
        lfo.initialise([](float x){ return std::sin(x); });

        shaper.functionToUse = [](float x) { return std::tanh(x); };

        envParams.attack = 0.005f;
        envParams.decay = 0.8f;
        envParams.sustain = 0.7f;
        envParams.release = 0.4f;
    }

    bool SynthVoice::canPlaySound(juce::SynthesiserSound* sound)
    {
        return dynamic_cast<PhotoSynthSound*>(sound) != nullptr;
    }

    void SynthVoice::prepare(double sampleRate, int samplesPerBlock, int outputChannels)
    {
        juce::dsp::ProcessSpec spec{sampleRate, (juce::uint32) samplesPerBlock, (juce::uint32) outputChannels};
        osc1.prepare(spec);
        osc2.prepare(spec);
        subOsc.prepare(spec);
        fmMod.prepare(spec);
        lfo.prepare(spec);
        filter.prepare(spec);
        shaper.prepare(spec);

        filter.setType(juce::dsp::StateVariableTPTFilterType::lowpass);
        filter.setCutoffFrequency(2000.0f);
        filter.setResonance(0.7f);

        cutoffSmoothed.reset(sampleRate, 0.02);
        resonanceSmoothed.reset(sampleRate, 0.02);
        lfoRateSmoothed.reset(sampleRate, 0.02);
        lfoDepthSmoothed.reset(sampleRate, 0.02);

        env.setSampleRate(sampleRate);
        env.setParameters(envParams);
    }

    void SynthVoice::reset()
    {
        env.reset();
        filter.reset();
    }

    void SynthVoice::updatePatch(const PatchParameters& patch, const ImageMetrics& metrics)
    {
        currentPatch = patch;
        currentMetrics = metrics;

        envParams.attack = juce::jlimit(0.001f, 5.0f, patch.attackTime);
        envParams.decay = juce::jlimit(0.01f, 10.0f, patch.decayTime);
        envParams.sustain = juce::jlimit(0.0f, 1.0f, patch.sustainLevel);
        envParams.release = juce::jlimit(0.01f, 8.0f, patch.releaseTime);
        env.setParameters(envParams);

        cutoffSmoothed.setTargetValue(juce::jlimit(20.0f, 20000.0f, patch.cutoffOffset));
        resonanceSmoothed.setTargetValue(juce::jlimit(0.1f, 10.0f, patch.resonance));
        lfoRateSmoothed.setTargetValue(juce::jlimit(0.1f, 20.0f, patch.lfoRate));
        lfoDepthSmoothed.setTargetValue(juce::jlimit(0.0f, 1.0f, patch.lfoDepth));
    }

    void SynthVoice::startNote(int midiNoteNumber, float velocity, juce::SynthesiserSound*, int)
    {
        baseFreq = (float) juce::MidiMessage::getMidiNoteInHertz(midiNoteNumber);

        const float detune = currentPatch.detuneCents;
        level = juce::jlimit(0.0f, 1.0f, velocity);

        const float fmRatio = juce::jlimit(0.5f, 8.0f, currentPatch.fmRatio);
        osc1.setFrequency(baseFreq);
        osc2.setFrequency(baseFreq * std::pow(2.0f, detune / 1200.0f));
        subOsc.setFrequency(baseFreq * 0.5f);
        fmMod.setFrequency(baseFreq * fmRatio);

        releaseTriggered = false;
        env.noteOn();
    }

    void SynthVoice::stopNote(float, bool allowTailOff)
    {
        if (allowTailOff)
        {
            releaseTriggered = true;
            env.noteOff();
        }
        else
        {
            clearCurrentNote();
            env.reset();
            releaseTriggered = false;
        }
    }

    void SynthVoice::pitchWheelMoved(int) {}
    void SynthVoice::controllerMoved(int, int) {}

    float SynthVoice::renderEngineSample(float phaseModSample)
    {
        const auto engine = currentPatch.engineType;

        const float a = osc1.processSample(0.0f);
        const float b = osc2.processSample(0.0f);
        const float s = subOsc.processSample(0.0f) * currentPatch.subOscLevel;

        if (engine == SynthEngineType::acoustic_piano_organ)
            return a * 0.50f + std::sin(std::asin(juce::jlimit(-1.0f, 1.0f, b))) * 0.35f + s * 0.6f + phaseModSample * 0.1f;

        if (engine == SynthEngineType::overdriven_saw_stack || engine == SynthEngineType::analog_brass)
            return shaper.processSample(a * 0.55f + b * 0.55f + s * 0.5f + phaseModSample * 0.2f);

        if (engine == SynthEngineType::fm_square_bell || engine == SynthEngineType::digital_fm_bells)
        {
            const float squareish = (a > 0.0f ? 1.0f : -1.0f) * 0.5f + (b > 0.0f ? 1.0f : -1.0f) * 0.35f;
            return squareish + phaseModSample * 0.65f + s * 0.4f;
        }

        // hybrid_wavetable
        return a * 0.4f + b * 0.4f + s * 0.35f + phaseModSample * 0.25f;
    }

    void SynthVoice::renderNextBlock(juce::AudioBuffer<float>& outputBuffer, int startSample, int numSamples)
    {
        if (!isVoiceActive())
            return;

        for (int sample = 0; sample < numSamples; ++sample)
        {
            const float lfoRate = lfoRateSmoothed.getNextValue();
            const float lfoDepth = lfoDepthSmoothed.getNextValue();
            lfo.setFrequency(lfoRate);

            const float lfoSample = lfo.processSample(0.0f);
            const float filterCutoff = juce::jlimit(20.0f, 20000.0f,
                cutoffSmoothed.getNextValue() + lfoSample * (lfoDepth * 2500.0f));
            filter.setCutoffFrequency(filterCutoff);
            filter.setResonance(resonanceSmoothed.getNextValue());

            const float fm = fmMod.processSample(0.0f) * (baseFreq * juce::jlimit(0.0f, 1.0f, currentPatch.fmAmount) * 5.0f) / 22050.0f;
            const float raw = renderEngineSample(fm);
            const float filtered = filter.processSample(0, raw);

            const float envValue = env.getNextSample();
            const float out = filtered * envValue * level * 0.25f;

            for (int ch = 0; ch < outputBuffer.getNumChannels(); ++ch)
                outputBuffer.addSample(ch, startSample + sample, out);
        }

        if (!env.isActive() && releaseTriggered)
        {
            clearCurrentNote();
            releaseTriggered = false;
        }
    }
}

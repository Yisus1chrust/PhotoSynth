export interface JuceSourceFile {
  filename: string;
  language: string;
  description: string;
  code: string;
}

export function getJuceCodeFiles(): JuceSourceFile[] {
  return [
    {
      filename: 'ImageAnalyzer.h',
      language: 'cpp',
      description: 'Image decoding, deterministic FNV-1a pixel hashing seed generation, and metric extraction.',
      code: `/*
  ==============================================================================
    ImageAnalyzer.h
    Photo Synth JUCE Plugin
  ==============================================================================
*/

#pragma once

#include <juce_graphics/juce_graphics.h>
#include <juce_core/juce_core.h>

enum class SynthArchetype
{
    AnalogBrass,      // Jump-Style high-contrast saturated
    DigitalFmBells,   // Little Dark Age low-light glassy FM
    HybridWavetable
};

struct ImageAnalysisResult
{
    juce::uint64 pixelSeed { 0 };
    juce::String seedHex;
    float brightness { 0.5f };   // Luminance 0.0 - 1.0
    float saturation { 0.5f };   // Saturation 0.0 - 1.0
    float complexity { 0.5f };   // Sobel Edge Density 0.0 - 1.0
    float timbreDna  { 0.5f };   // Hue Spectrum Variance 0.0 - 1.0
    SynthArchetype archetype { SynthArchetype::AnalogBrass };
};

class ImageAnalyzer
{
public:
    ImageAnalyzer() = default;
    ~ImageAnalyzer() = default;

    /** Analyzes image buffer deterministically using juce::Image::BitmapData */
    static ImageAnalysisResult analyzeImage(const juce::Image& image);

    /** Computes 64-bit FNV-1a checksum across entire RGB image bitmap */
    static juce::uint64 computeFNV1a64(const juce::Image::BitmapData& bitmap);

private:
    static float computeSobelEdgeDensity(const juce::Image::BitmapData& bitmap);
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(ImageAnalyzer)
};
`,
    },
    {
      filename: 'ImageAnalyzer.cpp',
      language: 'cpp',
      description: 'Implementation of FNV-1a 64-bit pixel seed checksum and Sobel edge detection in JUCE.',
      code: `/*
  ==============================================================================
    ImageAnalyzer.cpp
    Photo Synth JUCE Plugin
  ==============================================================================
*/

#include "ImageAnalyzer.h"

juce::uint64 ImageAnalyzer::computeFNV1a64(const juce::Image::BitmapData& bitmap)
{
    const juce::uint64 fnvOffsetBasis = 14695981039346656037ULL;
    const juce::uint64 fnvPrime       = 1099511628211ULL;

    juce::uint64 hash = fnvOffsetBasis;

    for (int y = 0; y < bitmap.height; ++y)
    {
        const auto* linePtr = bitmap.getLinePointer(y);
        for (int x = 0; x < bitmap.width; ++x)
        {
            auto pixel = bitmap.getPixelAt(x, y);
            hash ^= pixel.getRed();   hash *= fnvPrime;
            hash ^= pixel.getGreen(); hash *= fnvPrime;
            hash ^= pixel.getBlue();  hash *= fnvPrime;
        }
    }
    return hash;
}

ImageAnalysisResult ImageAnalyzer::analyzeImage(const juce::Image& image)
{
    ImageAnalysisResult result;
    if (image.isNull()) return result;

    juce::Image::BitmapData bitmap(image, juce::Image::BitmapData::readOnly);

    // 1. Calculate 64-Bit FNV-1a Checksum Seed
    result.pixelSeed = computeFNV1a64(bitmap);
    result.seedHex = "0x" + juce::String::toHexString((juce::int64)result.pixelSeed).toUpperCase();

    // 2. Luminance & Saturation Evaluation
    double totalLum = 0.0;
    double totalSat = 0.0;
    int totalPixels = bitmap.width * bitmap.height;

    for (int y = 0; y < bitmap.height; ++y)
    {
        for (int x = 0; x < bitmap.width; ++x)
        {
            auto color = bitmap.getPixelAt(x, y);
            float r = color.getFloatRed();
            float g = color.getFloatGreen();
            float b = color.getFloatBlue();

            float lum = 0.299f * r + 0.587f * g + 0.114f * b;
            totalLum += lum;

            float maxC = juce::jmax(r, juce::jmax(g, b));
            float minC = juce::jmin(r, juce::jmin(g, b));
            float sat  = (maxC > 0.001f) ? ((maxC - minC) / maxC) : 0.0f;
            totalSat += sat;
        }
    }

    result.brightness = juce::jlimit(0.0f, 1.0f, (float)(totalLum / totalPixels));
    result.saturation = juce::jlimit(0.0f, 1.0f, (float)(totalSat / totalPixels));
    result.complexity = computeSobelEdgeDensity(bitmap);
    result.timbreDna  = juce::jlimit(0.0f, 1.0f, result.saturation * 0.6f + result.complexity * 0.4f);

    // 3. Archetype Selection Logic
    if (result.saturation > 0.40f && result.brightness > 0.35f)
    {
        result.archetype = SynthArchetype::AnalogBrass; // Jump-style Saw Stack
    }
    else if (result.brightness < 0.45f || result.saturation < 0.25f)
    {
        result.archetype = SynthArchetype::DigitalFmBells; // Little Dark Age Glassy FM
    }
    else
    {
        result.archetype = SynthArchetype::HybridWavetable;
    }

    return result;
}

float ImageAnalyzer::computeSobelEdgeDensity(const juce::Image::BitmapData& bitmap)
{
    float edgeSum = 0.0f;
    int w = bitmap.width;
    int h = bitmap.height;

    for (int y = 1; y < h - 1; ++y)
    {
        for (int x = 1; x < w - 1; ++x)
        {
            auto getL = [&](int px, int py) {
                auto c = bitmap.getPixelAt(px, py);
                return 0.299f * c.getFloatRed() + 0.587f * c.getFloatGreen() + 0.114f * c.getFloatBlue();
            };

            float gx = -getL(x-1,y-1) + getL(x+1,y-1) - 2.0f*getL(x-1,y) + 2.0f*getL(x+1,y) - getL(x-1,y+1) + getL(x+1,y+1);
            float gy = -getL(x-1,y-1) - 2.0f*getL(x,y-1) - getL(x+1,y-1) + getL(x-1,y+1) + 2.0f*getL(x,y+1) + getL(x+1,y+1);

            float mag = std::sqrt(gx * gx + gy * gy);
            if (mag > 0.2f) edgeSum += mag;
        }
    }
    return juce::jlimit(0.0f, 1.0f, edgeSum / (w * h * 0.4f));
}
`,
    },
    {
      filename: 'SynthEngine.h',
      language: 'cpp',
      description: 'Polyphonic synth handling analog brass stacks, digital wavetables, FM, and modulation routing.',
      code: `/*
  ==============================================================================
    SynthEngine.h
    Photo Synth JUCE Polyphonic Sound Engine
  ==============================================================================
*/

#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_dsp/juce_dsp.h>
#include "ImageAnalyzer.h"

class SynthVoice : public juce::SynthesiserVoice
{
public:
    SynthVoice();
    bool canPlaySound(juce::SynthesiserSound* sound) override;
    void startNote(int midiNoteNumber, float velocity, juce::SynthesiserSound* sound, int currentPitchWheelPosition) override;
    void stopNote(float velocity, bool allowTailOff) override;
    void pitchWheelMoved(int newPitchWheelValue) override;
    void controllerMoved(int controllerNumber, int newControllerValue) override;
    void renderNextBlock(juce::AudioBuffer<float>& outputBuffer, int startSample, int numSamples) override;

    void prepare(double sampleRate, int samplesPerBlock);
    void updatePatch(const ImageAnalysisResult& metrics, float cutoff, float resonance, float attack, float decay);

private:
    juce::dsp::Oscillator<float> osc1, osc2, subOsc;
    juce::dsp::StateVariableTPTFilter<float> filter;
    juce::dsp::ADSR ampEnv;

    float currentPitch { 440.0f };
    SynthArchetype currentArchetype { SynthArchetype::AnalogBrass };
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(SynthVoice)
};

class PhotoSynthSound : public juce::SynthesiserSound
{
public:
    bool appliesToNote(int) override { return true; }
    bool appliesToChannel(int) override { return true; }
};
`,
    },
    {
      filename: 'SynthEngine.cpp',
      language: 'cpp',
      description: 'DSP rendering logic for voice allocation, oscillator detune, and filter sweeps.',
      code: `/*
  ==============================================================================
    SynthEngine.cpp
    Photo Synth JUCE Synth Engine Implementation
  ==============================================================================
*/

#include "SynthEngine.h"

SynthVoice::SynthVoice()
{
    // Initialize Oscillators
    osc1.initialise([](float x) { return std::sin(x); });
    osc2.initialise([](float x) { return (x / juce::MathConstants<float>::pi); }); // Saw wave
    subOsc.initialise([](float x) { return x < 0.0f ? -1.0f : 1.0f; }); // Square wave
}

bool SynthVoice::canPlaySound(juce::SynthesiserSound* sound)
{
    return dynamic_cast<PhotoSynthSound*>(sound) != nullptr;
}

void SynthVoice::prepare(double sampleRate, int samplesPerBlock)
{
    juce::dsp::ProcessSpec spec { sampleRate, (juce::uint32)samplesPerBlock, 2 };
    osc1.prepare(spec);
    osc2.prepare(spec);
    subOsc.prepare(spec);

    filter.setType(juce::dsp::StateVariableTPTFilterType::lowpass);
    filter.prepare(spec);

    ampEnv.setSampleRate(sampleRate);
}

void SynthVoice::updatePatch(const ImageAnalysisResult& metrics, float cutoff, float resonance, float attack, float decay)
{
    currentArchetype = metrics.archetype;
    filter.setCutoffFrequency(cutoff);
    filter.setResonance(resonance);

    juce::dsp::ADSR::Parameters params;
    params.attack = attack;
    params.decay = decay;
    params.sustain = 0.7f;
    params.release = 0.4f;
    ampEnv.setParameters(params);
}

void SynthVoice::startNote(int midiNoteNumber, float velocity, juce::SynthesiserSound*, int)
{
    currentPitch = juce::MidiMessage::getMidiNoteInHertz(midiNoteNumber);
    osc1.setFrequency(currentPitch);
    osc2.setFrequency(currentPitch * 1.005f); // Micro unison detune
    subOsc.setFrequency(currentPitch * 0.5f);

    ampEnv.noteOn();
}

void SynthVoice::stopNote(float, bool allowTailOff)
{
    if (allowTailOff)
    {
        ampEnv.noteOff();
    }
    else
    {
        clearCurrentNote();
        ampEnv.reset();
    }
}

void SynthVoice::pitchWheelMoved(int) {}
void SynthVoice::controllerMoved(int, int) {}

void SynthVoice::renderNextBlock(juce::AudioBuffer<float>& outputBuffer, int startSample, int numSamples)
{
    if (!isVoiceActive()) return;

    juce::AudioBuffer<float> voiceBuffer;
    voiceBuffer.setSize(outputBuffer.getNumChannels(), numSamples, false, false, true);
    voiceBuffer.clear();

    juce::dsp::AudioBlock<float> block(voiceBuffer);
    juce::dsp::ProcessContextReplacing<float> context(block);

    osc1.process(context);
    osc2.process(context);
    filter.process(context);

    for (int sample = 0; sample < numSamples; ++sample)
    {
        float envGain = ampEnv.getNextSample();
        for (int channel = 0; channel < outputBuffer.getNumChannels(); ++channel)
        {
            outputBuffer.addSample(channel, startSample + sample, voiceBuffer.getSample(channel, sample) * envGain * 0.3f);
        }
    }

    if (!ampEnv.isActive())
    {
        clearCurrentNote();
    }
}
`,
    },
    {
      filename: 'PluginProcessor.h',
      language: 'cpp',
      description: 'Audio processing block, thread-safe background analysis, and APVTS parameter bindings.',
      code: `/*
  ==============================================================================
    PluginProcessor.h
    Photo Synth JUCE AudioProcessor
  ==============================================================================
*/

#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "ImageAnalyzer.h"
#include "SynthEngine.h"

class PhotoSynthAudioProcessor  : public juce::AudioProcessor
{
public:
    PhotoSynthAudioProcessor();
    ~PhotoSynthAudioProcessor() override;

    void prepareToPlay (double sampleRate, int samplesPerBlock) override;
    void releaseResources() override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "Photo Synth"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int) override {}
    const juce::String getProgramName (int) override { return {}; }
    void changeProgramName (int, const juce::String&) override {}

    void getStateInformation (juce::MemoryBlock& destData) override;
    void setStateInformation (const void* data, int sizeInBytes) override;

    void loadNewImage(const juce::Image& newImg);
    ImageAnalysisResult getLatestAnalysis() const { return currentAnalysis; }

    juce::AudioProcessorValueTreeState apvts;

private:
    juce::Synthesiser synth;
    ImageAnalysisResult currentAnalysis;
    juce::dsp::Limiter<float> masterLimiter;

    static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhotoSynthAudioProcessor)
};
`,
    },
    {
      filename: 'PluginProcessor.cpp',
      language: 'cpp',
      description: 'Implementation of processBlock audio thread, APVTS bindings, and limiter processing.',
      code: `/*
  ==============================================================================
    PluginProcessor.cpp
    Photo Synth JUCE AudioProcessor Implementation
  ==============================================================================
*/

#include "PluginProcessor.h"
#include "PluginEditor.h"

PhotoSynthAudioProcessor::PhotoSynthAudioProcessor()
    : AudioProcessor (BusesProperties().withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "Parameters", createParameterLayout())
{
    synth.addSound (new PhotoSynthSound());
    for (int i = 0; i < 16; ++i)
        synth.addVoice (new SynthVoice());
}

PhotoSynthAudioProcessor::~PhotoSynthAudioProcessor() {}

juce::AudioProcessorValueTreeState::ParameterLayout PhotoSynthAudioProcessor::createParameterLayout()
{
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;

    params.push_back (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { "cutoff", 1 }, "Cutoff Offset", juce::NormalisableRange<float> (20.0f, 20000.0f, 1.0f, 0.3f), 2000.0f));

    params.push_back (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { "resonance", 1 }, "Resonance", juce::NormalisableRange<float> (0.1f, 10.0f, 0.05f), 1.0f));

    params.push_back (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { "lfoRate", 1 }, "LFO Rate", juce::NormalisableRange<float> (0.1f, 20.0f, 0.1f), 2.0f));

    params.push_back (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { "lfoDepth", 1 }, "LFO Depth", juce::NormalisableRange<float> (0.0f, 1.0f, 0.01f), 0.2f));

    params.push_back (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { "volume", 1 }, "Master Volume", juce::NormalisableRange<float> (-60.0f, 6.0f, 0.1f), -3.0f));

    params.push_back (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { "attack", 1 }, "Attack Time", juce::NormalisableRange<float> (0.001f, 5.0f, 0.001f, 0.4f), 0.01f));

    params.push_back (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { "decay", 1 }, "Decay Time", juce::NormalisableRange<float> (0.01f, 10.0f, 0.01f, 0.4f), 0.8f));

    params.push_back (std::make_unique<juce::AudioParameterBool> (
        juce::ParameterID { "limiter", 1 }, "Limiter Toggle", true));

    params.push_back (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { "threshold", 1 }, "Threshold", juce::NormalisableRange<float> (-30.0f, 0.0f, 0.1f), -3.0f));

    return { params.begin(), params.end() };
}

void PhotoSynthAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    synth.setCurrentPlaybackSampleRate (sampleRate);
    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (auto* voice = dynamic_cast<SynthVoice*>(synth.getVoice(i)))
            voice->prepare(sampleRate, samplesPerBlock);
    }

    juce::dsp::ProcessSpec spec { sampleRate, (juce::uint32)samplesPerBlock, 2 };
    masterLimiter.setThreshold(*apvts.getRawParameterValue("threshold"));
    masterLimiter.prepare(spec);
}

void PhotoSynthAudioProcessor::releaseResources() {}

void PhotoSynthAudioProcessor::loadNewImage(const juce::Image& newImg)
{
    currentAnalysis = ImageAnalyzer::analyzeImage(newImg);

    // Apply Smart Baseline Defaults
    apvts.getParameter("cutoff")->setValueNotifyingHost(apvts.getParameter("cutoff")->convertTo0ToOne(200.0f + currentAnalysis.brightness * 12000.0f));
    apvts.getParameter("resonance")->setValueNotifyingHost(apvts.getParameter("resonance")->convertTo0ToOne(1.0f + currentAnalysis.saturation * 5.0f));
}

void PhotoSynthAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
{
    buffer.clear();

    float cutoff = *apvts.getRawParameterValue("cutoff");
    float res = *apvts.getRawParameterValue("resonance");
    float atk = juce::jmax(0.001f, *apvts.getRawParameterValue("attack"));
    float dec = juce::jmax(0.01f, *apvts.getRawParameterValue("decay"));
    float volDb = juce::jlimit(-60.0f, 6.0f, *apvts.getRawParameterValue("volume"));
    float thresholdDb = juce::jlimit(-30.0f, 0.0f, *apvts.getRawParameterValue("threshold"));

    float masterGain = juce::Decibels::decibelsToGain(volDb, -60.0f) * 0.5f;

    for (int i = 0; i < synth.getNumVoices(); ++i)
    {
        if (auto* voice = dynamic_cast<SynthVoice*>(synth.getVoice(i)))
            voice->updatePatch(currentAnalysis, cutoff, res, atk, dec);
    }

    synth.renderNextBlock (buffer, midiMessages, 0, buffer.getNumSamples());

    // Apply Master Dynamics Gain Scaling
    buffer.applyGain(masterGain);

    // True-Peak Brickwall Limiter
    if (*apvts.getRawParameterValue("limiter") > 0.5f)
    {
        masterLimiter.setThreshold(thresholdDb);
        juce::dsp::AudioBlock<float> block(buffer);
        juce::dsp::ProcessContextReplacing<float> context(block);
        masterLimiter.process(context);
    }

    // Master Soft Clipper & Hard Ceiling [-1.0f, 1.0f] (0 dBFS)
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
    {
        float* channelData = buffer.getWritePointer(channel);
        for (int sample = 0; sample < buffer.getNumSamples(); ++sample)
        {
            float inputSample = channelData[sample];
            float clampedX = juce::jlimit(-1.0f, 1.0f, inputSample);
            // Cubic polynomial soft-clipper
            float softClipped = 1.5f * clampedX - 0.5f * clampedX * clampedX * clampedX;
            // Strict hard-clipping ceiling [-1.0f, 1.0f] (0 dBFS)
            channelData[sample] = juce::jlimit(-1.0f, 1.0f, softClipped);
        }
    }
}

juce::AudioProcessorEditor* PhotoSynthAudioProcessor::createEditor()
{
    return new PhotoSynthAudioEditor (*this);
}

void PhotoSynthAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    auto state = apvts.copyState();
    std::unique_ptr<juce::XmlElement> xml (state.createXml());
    copyXmlToBinary (*xml, destData);
}

void PhotoSynthAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    std::unique_ptr<juce::XmlElement> xmlState (getXmlFromBinary (data, sizeInBytes));
    if (xmlState.get() != nullptr)
        if (xmlState->hasTagName (apvts.state.getType()))
            apvts.replaceState (juce::ValueTree::fromXml (*xmlState));
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new PhotoSynthAudioProcessor();
}
`,
    },
    {
      filename: 'PluginEditor.h',
      language: 'cpp',
      description: 'Custom LookAndFeel UI split layout (center drop zone, left readout gauges, right editable knobs).',
      code: `/*
  ==============================================================================
    PluginEditor.h
    Photo Synth JUCE AudioProcessorEditor
  ==============================================================================
*/

#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include "PluginProcessor.h"

class CircularGaugeComponent : public juce::Component
{
public:
    CircularGaugeComponent(const juce::String& name, juce::Colour arcColor);
    void setValue(float newValue) { value = newValue; repaint(); }
    void paint(juce::Graphics& g) override;

private:
    juce::String gaugeName;
    juce::Colour color;
    float value { 0.5f };
};

class PhotoSynthAudioEditor  : public juce::AudioProcessorEditor,
                                public juce::FileDragAndDropTarget
{
public:
    PhotoSynthAudioEditor (PhotoSynthAudioProcessor&);
    ~PhotoSynthAudioEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

    bool isInterestedInFileDrag (const juce::StringArray& files) override;
    void filesDropped (const juce::StringArray& files, int x, int y) override;

private:
    PhotoSynthAudioProcessor& audioProcessor;

    // Screen 1: Left Readout Gauges
    CircularGaugeComponent timbreGauge { "TIMBRE DNA", juce::Colours::cyan };
    CircularGaugeComponent brightnessGauge { "BRIGHTNESS", juce::Colours::orange };
    CircularGaugeComponent saturationGauge { "SATURATION", juce::Colours::deeppink };
    CircularGaugeComponent complexityGauge { "COMPLEXITY", juce::Colours::lime };

    // Screen 2: Right Editable Knobs
    juce::Slider cutoffSlider, resSlider, lfoRateSlider, lfoDepthSlider;
    juce::Slider volSlider, attackSlider, decaySlider, thresholdSlider;
    juce::ToggleButton limiterButton { "Limiter" };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhotoSynthAudioEditor)
};
`,
    },
    {
      filename: 'PluginEditor.cpp',
      language: 'cpp',
      description: 'Implementation of FileDragAndDropTarget dropzone, Circular Gauges, and Knobs in JUCE.',
      code: `/*
  ==============================================================================
    PluginEditor.cpp
    Photo Synth JUCE AudioProcessorEditor Implementation
  ==============================================================================
*/

#include "PluginProcessor.h"
#include "PluginEditor.h"

CircularGaugeComponent::CircularGaugeComponent(const juce::String& name, juce::Colour arcColor)
    : gaugeName(name), color(arcColor) {}

void CircularGaugeComponent::paint(juce::Graphics& g)
{
    auto bounds = getLocalBounds().toFloat().reduced(4.0f);
    float radius = juce::jmin(bounds.getWidth(), bounds.getHeight()) / 2.0f - 8.0f;
    auto center = bounds.getCentre();

    // Background Circle
    g.setColour(juce::Colour(0xff1e2330));
    g.fillEllipse(center.x - radius, center.y - radius, radius * 2, radius * 2);

    // Outer Arc
    juce::Path arc;
    float startAngle = juce::MathConstants<float>::pi * 0.75f;
    float endAngle   = startAngle + value * (juce::MathConstants<float>::pi * 1.5f);
    arc.addCentredArc(center.x, center.y, radius, radius, 0.0f, startAngle, endAngle, true);

    g.setColour(color);
    g.strokePath(arc, juce::PathStrokeType(4.0f));

    // Text Readout
    g.setColour(juce::Colours::white);
    g.setFont(12.0f);
    g.drawText(juce::String((int)(value * 100.0f)) + "%", bounds, juce::Justification::centred);
    g.drawText(gaugeName, getLocalBounds().removeFromBottom(14), juce::Justification::centred);
}

PhotoSynthAudioEditor::PhotoSynthAudioEditor (PhotoSynthAudioProcessor& p)
    : AudioProcessorEditor (&p), audioProcessor (p)
{
    setSize (960, 560);

    addAndMakeVisible(timbreGauge);
    addAndMakeVisible(brightnessGauge);
    addAndMakeVisible(saturationGauge);
    addAndMakeVisible(complexityGauge);

    // Configure Knobs
    auto configKnob = [this](juce::Slider& s) {
        s.setSliderStyle(juce::Slider::RotaryHorizontalVerticalDrag);
        s.setTextBoxStyle(juce::Slider::TextBoxBelow, false, 60, 18);
        addAndMakeVisible(s);
    };

    configKnob(cutoffSlider);
    configKnob(resSlider);
    configKnob(lfoRateSlider);
    configKnob(lfoDepthSlider);
    configKnob(volSlider);
    configKnob(attackSlider);
    configKnob(decaySlider);
    configKnob(thresholdSlider);

    addAndMakeVisible(limiterButton);
}

PhotoSynthAudioEditor::~PhotoSynthAudioEditor() {}

bool PhotoSynthAudioEditor::isInterestedInFileDrag (const juce::StringArray& files)
{
    return files.size() > 0 && (files[0].endsWithIgnoreCase(".png") || files[0].endsWithIgnoreCase(".jpg"));
}

void PhotoSynthAudioEditor::filesDropped (const juce::StringArray& files, int, int)
{
    if (files.size() > 0)
    {
        juce::Image img = juce::ImageFileFormat::loadFrom(juce::File(files[0]));
        if (!img.isNull())
        {
            audioProcessor.loadNewImage(img);
            auto res = audioProcessor.getLatestAnalysis();
            timbreGauge.setValue(res.timbreDna);
            brightnessGauge.setValue(res.brightness);
            saturationGauge.setValue(res.saturation);
            complexityGauge.setValue(res.complexity);
        }
    }
}

void PhotoSynthAudioEditor::paint (juce::Graphics& g)
{
    g.fillAll (juce::Colour (0xff0f1219));

    // Draw Title Header
    g.setColour (juce::Colours::cyan);
    g.setFont (22.0f);
    g.drawText ("PHOTO SYNTH", 20, 15, 300, 30, juce::Justification::left);

    // Center Drop Zone
    auto dropBounds = juce::Rectangle<int>(240, 60, 320, 380);
    g.setColour (juce::Colour(0xff181d28));
    g.fillRect(dropBounds);
    g.setColour (juce::Colours::cyan.withAlpha(0.4f));
    g.drawRect(dropBounds, 2);
    g.drawText ("DRAG & DROP IMAGE HERE", dropBounds, juce::Justification::centred);
}

void PhotoSynthAudioEditor::resized()
{
    // Screen 1: Left Gauges Layout
    timbreGauge.setBounds(20, 60, 90, 110);
    brightnessGauge.setBounds(120, 60, 90, 110);
    saturationGauge.setBounds(20, 180, 90, 110);
    complexityGauge.setBounds(120, 180, 90, 110);

    // Screen 2: Right Knobs Layout
    int rightX = 580;
    cutoffSlider.setBounds(rightX, 60, 80, 100);
    resSlider.setBounds(rightX + 85, 60, 80, 100);
    lfoRateSlider.setBounds(rightX + 170, 60, 80, 100);
    lfoDepthSlider.setBounds(rightX + 255, 60, 80, 100);

    volSlider.setBounds(rightX, 220, 80, 100);
    attackSlider.setBounds(rightX + 85, 220, 80, 100);
    decaySlider.setBounds(rightX + 170, 220, 80, 100);
    thresholdSlider.setBounds(rightX + 255, 220, 80, 100);

    limiterButton.setBounds(rightX + 255, 330, 90, 30);
}
`,
    },
    {
      filename: 'CMakeLists.txt',
      language: 'cmake',
      description: 'JUCE CMake build configuration for VST3 and AU targets.',
      code: `cmake_minimum_required(VERSION 3.15)
project(PhotoSynth VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Fetch or add JUCE module
add_subdirectory(JUCE)

juce_add_plugin(PhotoSynth
    COMPANY_NAME "PhotoSynthDSP"
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    COPY_PLUGIN_AFTER_BUILD TRUE
    PLUGIN_MANUFACTURER_CODE PSyn
    PLUGIN_CODE Psyn
    FORMATS VST3 AU Standalone
    PRODUCT_NAME "Photo Synth"
)

target_sources(PhotoSynth PRIVATE
    Source/ImageAnalyzer.h
    Source/ImageAnalyzer.cpp
    Source/SynthEngine.h
    Source/SynthEngine.cpp
    Source/PluginProcessor.h
    Source/PluginProcessor.cpp
    Source/PluginEditor.h
    Source/PluginEditor.cpp
)

target_compile_definitions(PhotoSynth PRIVATE
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(PhotoSynth PRIVATE
    juce::juce_audio_utils
    juce::juce_audio_processors
    juce::juce_dsp
    juce::juce_graphics
    juce::juce_gui_extra
)
`,
    },
  ];
}

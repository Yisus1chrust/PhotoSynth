#pragma once

#include <JuceHeader.h>
#include "CommonTypes.h"
#include "ImageAnalyzer.h"
#include "MorphEngine.h"
#include "SynthEngine.h"
#include "PhysicalModeling.h"
#include "EffectsChain.h"

namespace photosynth
{
    class PhotoSynthAudioProcessor : public juce::AudioProcessor
    {
    public:
        using juce::AudioProcessor::processBlock;

        PhotoSynthAudioProcessor();
        ~PhotoSynthAudioProcessor() override = default;

        void prepareToPlay(double sampleRate, int samplesPerBlock) override;
        void releaseResources() override;
        bool isBusesLayoutSupported(const BusesLayout& layouts) const override;

        void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

        juce::AudioProcessorEditor* createEditor() override;
        bool hasEditor() const override { return true; }

        const juce::String getName() const override { return JucePlugin_Name; }
        bool acceptsMidi() const override { return true; }
        bool producesMidi() const override { return false; }
        bool isMidiEffect() const override { return false; }
        double getTailLengthSeconds() const override { return 0.5; }

        int getNumPrograms() override { return 1; }
        int getCurrentProgram() override { return 0; }
        void setCurrentProgram(int) override {}
        const juce::String getProgramName(int) override { return {}; }
        void changeProgramName(int, const juce::String&) override {}

        void getStateInformation(juce::MemoryBlock& destData) override;
        void setStateInformation(const void* data, int sizeInBytes) override;

        juce::AudioProcessorValueTreeState apvts;
        juce::MidiKeyboardState& getKeyboardState() { return keyboardState; }

        void loadImageFile(const juce::File& file);
        const ImageMetrics& getMetrics() const { return currentMetrics; }
        const PatchParameters& getPatch() const { return currentPatch; }

        void savePresetToFile(const juce::File& file);
        void loadPresetFromFile(const juce::File& file);

        void getScopeData(juce::AudioBuffer<float>& target);

        static juce::AudioProcessorValueTreeState::ParameterLayout createParameterLayout();

    private:
        SynthEngine synthEngine;
        PhysicalModeling physicalModeling;
        EffectsChain effectsChain;

        juce::LinearSmoothedValue<float> masterGainSmoothed;

        juce::dsp::Compressor<float> limiter;
        juce::dsp::WaveShaper<float> masterClipper;

        juce::CriticalSection scopeLock;
        juce::AudioBuffer<float> scopeBuffer;

        juce::MidiKeyboardState keyboardState;

        ImageMetrics currentMetrics;
        PatchParameters currentPatch;

        void updatePatchFromParameters();
        void pushScope(const juce::AudioBuffer<float>& block);

        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PhotoSynthAudioProcessor)
    };
}

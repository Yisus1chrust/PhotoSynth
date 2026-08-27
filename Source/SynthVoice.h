#pragma once

#include <JuceHeader.h>
#include "CommonTypes.h"

namespace photosynth
{
    class PhotoSynthSound : public juce::SynthesiserSound
    {
    public:
        bool appliesToNote(int) override { return true; }
        bool appliesToChannel(int) override { return true; }
    };

    class SynthVoice : public juce::SynthesiserVoice
    {
    public:
        using juce::SynthesiserVoice::renderNextBlock;

        SynthVoice();

        bool canPlaySound(juce::SynthesiserSound* sound) override;
        void startNote(int midiNoteNumber, float velocity, juce::SynthesiserSound* sound, int currentPitchWheelPosition) override;
        void stopNote(float velocity, bool allowTailOff) override;
        void pitchWheelMoved(int newPitchWheelValue) override;
        void controllerMoved(int controllerNumber, int newControllerValue) override;
        void renderNextBlock(juce::AudioBuffer<float>& outputBuffer, int startSample, int numSamples) override;

        void prepare(double sampleRate, int samplesPerBlock, int outputChannels);
        void reset();
        void updatePatch(const PatchParameters& patch, const ImageMetrics& metrics);

    private:
        juce::dsp::Oscillator<float> osc1, osc2, subOsc, fmMod;
        juce::dsp::StateVariableTPTFilter<float> filter;
        juce::dsp::WaveShaper<float> shaper;

        juce::ADSR env;
        juce::ADSR::Parameters envParams;

        juce::SmoothedValue<float> cutoffSmoothed, resonanceSmoothed;
        juce::SmoothedValue<float> lfoRateSmoothed, lfoDepthSmoothed;

        juce::dsp::Oscillator<float> lfo;

        PatchParameters currentPatch;
        ImageMetrics currentMetrics;

        float level = 0.8f;
        float baseFreq = 440.0f;
        bool releaseTriggered = false;

        float renderEngineSample(float phaseModSample);
    };
}

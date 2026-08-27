#pragma once

#include <JuceHeader.h>
#include "CommonTypes.h"

namespace photosynth
{
    class EffectsChain
    {
    public:
        void prepare(const juce::dsp::ProcessSpec& spec);
        void reset();
        void updateFromPatch(const PatchParameters& patch, double sampleRate);
        void processBlock(juce::AudioBuffer<float>& buffer);

    private:
        juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> delayLine { 65536 };
        juce::dsp::Reverb reverb;
        juce::dsp::Chorus<float> chorus;
        juce::dsp::Phaser<float> phaser;
        juce::dsp::Chorus<float> flanger;

        float delayTimeSamples = 15435.0f;
        float delayFeedback = 0.35f;
        float delayMix = 0.2f;
        float distortionMix = 0.15f;
        float sampleRate = 44100.0f;
        float distortionDrive = 20.0f;

        float processDistortionSample(float x) const;
    };
}

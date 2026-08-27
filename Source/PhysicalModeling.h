#pragma once

#include <JuceHeader.h>
#include "CommonTypes.h"

namespace photosynth
{
    class PhysicalModeling
    {
    public:
        void prepare(const juce::dsp::ProcessSpec& spec);
        void reset();
        void updateFromPatch(const PatchParameters& patch, double sampleRate);
        void processBlock(juce::AudioBuffer<float>& buffer);

    private:
        juce::dsp::StateVariableTPTFilter<float> body1, body2, body3;
        juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> flutterDelay { 8192 };
        juce::dsp::Oscillator<float> flutterLfo;

        std::vector<float> shaperCurve;
        float flutterDepthSamples = 0.0f;
        float acousticWeight = 0.2f;
        float lastSampleRate = 44100.0f;

        float saturate(float x) const;
    };
}

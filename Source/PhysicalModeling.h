#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>
#include "CommonTypes.h"

namespace photosynth
{
    class PhysicalModeling
    {
    public:
        PhysicalModeling() = default;
        ~PhysicalModeling() = default;

        void prepare (const juce::dsp::ProcessSpec& spec);
        void reset();
        void updateFromPatch (const PatchParameters& patch, double sampleRate);
        void processBlock (juce::AudioBuffer<float>& buffer);

    private:
        float saturate (float x) const;

        juce::dsp::StateVariableTPTFilter<float> body1;
        juce::dsp::StateVariableTPTFilter<float> body2;
        juce::dsp::StateVariableTPTFilter<float> body3;

        juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> flutterDelay;
        juce::dsp::Oscillator<float> flutterLfo;

        std::vector<float> shaperCurve;
        float lastSampleRate = 44100.0f;
        float acousticWeight = 0.0f;
        float flutterDepthSamples = 0.0f;
    };
}

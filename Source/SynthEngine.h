#pragma once

#include <JuceHeader.h>
#include "CommonTypes.h"
#include "SynthVoice.h"

namespace photosynth
{
    class SynthEngine
    {
    public:
        static constexpr int maxPolyphony = 16;

        SynthEngine();

        void prepare(double sampleRate, int samplesPerBlock, int outputChannels);
        void reset();
        void render(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi);

        void setPatch(const PatchParameters& patch);
        void setMetrics(const ImageMetrics& metrics);

        PatchParameters getPatch() const { return currentPatch; }

    private:
        juce::Synthesiser synth;
        PatchParameters currentPatch;
        ImageMetrics currentMetrics;
    };
}

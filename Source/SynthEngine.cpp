#include "SynthEngine.h"

namespace photosynth
{
    SynthEngine::SynthEngine()
    {
        synth.setNoteStealingEnabled(true);
        synth.addSound(new PhotoSynthSound());
        for (int i = 0; i < maxPolyphony; ++i)
            synth.addVoice(new SynthVoice());
    }

    void SynthEngine::prepare(double sampleRate, int samplesPerBlock, int outputChannels)
    {
        synth.setCurrentPlaybackSampleRate(sampleRate);
        for (int i = 0; i < synth.getNumVoices(); ++i)
            if (auto* v = dynamic_cast<SynthVoice*>(synth.getVoice(i)))
                v->prepare(sampleRate, samplesPerBlock, outputChannels);
    }

    void SynthEngine::reset()
    {
        for (int i = 0; i < synth.getNumVoices(); ++i)
            if (auto* v = dynamic_cast<SynthVoice*>(synth.getVoice(i)))
                v->reset();
    }

    void SynthEngine::setPatch(const PatchParameters& patch)
    {
        currentPatch = patch;
        for (int i = 0; i < synth.getNumVoices(); ++i)
            if (auto* v = dynamic_cast<SynthVoice*>(synth.getVoice(i)))
                v->updatePatch(currentPatch, currentMetrics);
    }

    void SynthEngine::setMetrics(const ImageMetrics& metrics)
    {
        currentMetrics = metrics;
        for (int i = 0; i < synth.getNumVoices(); ++i)
            if (auto* v = dynamic_cast<SynthVoice*>(synth.getVoice(i)))
                v->updatePatch(currentPatch, currentMetrics);
    }

    void SynthEngine::render(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
    {
        synth.renderNextBlock(buffer, midi, 0, buffer.getNumSamples());
    }
}

#include "PhysicalModeling.h"

namespace photosynth
{
    void PhysicalModeling::prepare(const juce::dsp::ProcessSpec& spec)
    {
        lastSampleRate = (float) spec.sampleRate;

        body1.prepare(spec);
        body2.prepare(spec);
        body3.prepare(spec);
        body1.setType(juce::dsp::StateVariableTPTFilterType::bandpass);
        body2.setType(juce::dsp::StateVariableTPTFilterType::bandpass);
        body3.setType(juce::dsp::StateVariableTPTFilterType::bandpass);

        flutterDelay.prepare(spec);
        flutterLfo.initialise([](float x) { return std::sin(x); });
        flutterLfo.prepare(spec);
        flutterLfo.setFrequency(0.8f);

        shaperCurve.resize(4096);
        reset();
    }

    void PhysicalModeling::reset()
    {
        body1.reset();
        body2.reset();
        body3.reset();
        flutterDelay.reset();
    }

    void PhysicalModeling::updateFromPatch(const PatchParameters& patch, double sampleRate)
    {
        lastSampleRate = (float) sampleRate;
        const auto& pm = patch.physicalModel;

        const float q = juce::jmax(0.5f, 12.0f * (1.0f - pm.bodyDamping));
        body1.setCutoffFrequency(pm.bodyResonanceFreqs[0]);
        body2.setCutoffFrequency(pm.bodyResonanceFreqs[1]);
        body3.setCutoffFrequency(pm.bodyResonanceFreqs[2]);

        body1.setResonance(q);
        body2.setResonance(q);
        body3.setResonance(q);

        acousticWeight = juce::jlimit(0.0f, 1.0f, pm.acousticWeight * 0.25f);

        const float eraVal = patch.temporalEraVal;
        const float eraFlutterSpeed = eraVal < 0.38f ? 1.8f + (0.38f - eraVal) * 2.5f : 0.8f;
        const float eraFlutterDepth = eraVal < 0.38f ? 0.35f + (0.38f - eraVal) * 0.45f : 0.05f;

        flutterLfo.setFrequency(pm.tapeFlutterSpeed > 0.0f ? pm.tapeFlutterSpeed : eraFlutterSpeed);
        const float depthMs = (pm.tapeFlutterDepth > 0.0f ? pm.tapeFlutterDepth : eraFlutterDepth) * 0.0006f;
        flutterDepthSamples = juce::jlimit(0.0f, 128.0f, depthMs * (float) sampleRate);

        const float warmth = juce::jlimit(0.0f, 1.0f, pm.analogSaturationWarmth);
        const float drive = 1.0f + warmth * 3.5f;
        for (size_t i = 0; i < shaperCurve.size(); ++i)
        {
            float x = (2.0f * (float) i / (float)(shaperCurve.size() - 1)) - 1.0f;
            float asymX = x > 0.0f ? x : x * (1.0f - warmth * 0.18f);
            shaperCurve[i] = std::tanh(asymX * drive) / std::tanh(drive);
        }
    }

    float PhysicalModeling::saturate(float x) const
    {
        const float normalized = (juce::jlimit(-1.0f, 1.0f, x) + 1.0f) * 0.5f;
        const auto index = (int) juce::jlimit(0.0f, (float) shaperCurve.size() - 1.0f, normalized * (float)(shaperCurve.size() - 1));
        return shaperCurve[(size_t) index];
    }

    void PhysicalModeling::processBlock(juce::AudioBuffer<float>& buffer)
    {
        if (buffer.getNumSamples() == 0) return;

        juce::AudioBuffer<float> resonant(buffer.getNumChannels(), buffer.getNumSamples());
        resonant.makeCopyOf(buffer);

        juce::dsp::AudioBlock<float> rb(resonant);
        juce::dsp::ProcessContextReplacing<float> ctx(rb);
        body1.process(ctx);
        body2.process(ctx);
        body3.process(ctx);

        for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
        {
            auto* dry = buffer.getWritePointer(ch);
            auto* wet = resonant.getReadPointer(ch);

            for (int i = 0; i < buffer.getNumSamples(); ++i)
            {
                const float lfo = flutterLfo.processSample(0.0f);
                const float d = 1.0f + lfo * flutterDepthSamples;
                flutterDelay.pushSample(ch, dry[i] + wet[i] * acousticWeight);
                float fluttered = flutterDelay.popSample(ch, d, true);

                dry[i] = saturate(fluttered);
            }
        }
    }
}

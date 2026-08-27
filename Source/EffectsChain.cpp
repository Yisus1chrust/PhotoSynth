#include "EffectsChain.h"

namespace photosynth
{
    void EffectsChain::prepare(const juce::dsp::ProcessSpec& spec)
    {
        sampleRate = (float) spec.sampleRate;
        delayLine.prepare(spec);
        reverb.prepare(spec);
        chorus.prepare(spec);
        phaser.prepare(spec);
        flanger.prepare(spec);
        reset();
    }

    void EffectsChain::reset()
    {
        delayLine.reset();
        reverb.reset();
        chorus.reset();
        phaser.reset();
        flanger.reset();
    }

    void EffectsChain::updateFromPatch(const PatchParameters& patch, double)
    {
        const auto& fx = patch.effects;

        const float dP1 = fx.delay.param1;
        const float dP2 = fx.delay.param2;
        const float timeSec = 0.05f + dP1 * 0.75f;
        delayTimeSamples = timeSec * sampleRate;
        delayFeedback = fx.delay.enabled ? dP2 * 0.85f : 0.0f;
        delayMix = fx.delay.enabled ? juce::jmax(patch.delayMix, dP1 * 0.5f) : 0.0f;

        juce::Reverb::Parameters rv;
        rv.roomSize = juce::jlimit(0.0f, 1.0f, fx.reverb.param2);
        rv.damping = juce::jlimit(0.0f, 1.0f, patch.physicalModel.spatialReflection.absorption);
        rv.wetLevel = fx.reverb.enabled ? juce::jmax(patch.reverbMix, fx.reverb.param1 * 0.8f) : 0.0f;
        rv.dryLevel = 1.0f;
        rv.width = 0.8f;
        rv.freezeMode = 0.0f;
        reverb.setParameters(rv);

        chorus.setRate(0.05f + fx.chorus.param1 * 8.0f);
        chorus.setDepth(juce::jlimit(0.0f, 1.0f, fx.chorus.param2));
        chorus.setCentreDelay(7.0f);
        chorus.setFeedback(0.0f);
        chorus.setMix(fx.chorus.enabled ? fx.chorus.intensity * 0.45f : 0.0f);

        phaser.setRate(0.05f + fx.phaser.param1 * 6.0f);
        phaser.setDepth(fx.phaser.enabled ? fx.phaser.param2 : 0.0f);
        phaser.setCentreFrequency(300.0f + fx.phaser.param2 * 2600.0f);
        phaser.setFeedback(0.1f);
        phaser.setMix(fx.phaser.enabled ? fx.phaser.param2 * 0.45f : 0.0f);

        flanger.setRate(0.05f + fx.flanger.param1 * 6.0f);
        flanger.setDepth(fx.flanger.enabled ? fx.flanger.param2 : 0.0f);
        flanger.setCentreDelay(2.0f + fx.flanger.param1 * 6.0f);
        flanger.setFeedback(juce::jlimit(-0.95f, 0.95f, fx.flanger.param2 * 0.85f));
        flanger.setMix(fx.flanger.enabled ? fx.flanger.param2 * 0.45f : 0.0f);

        distortionDrive = 20.0f + (fx.distortion.param1 * 60.0f);
        distortionMix = fx.distortion.enabled ? fx.distortion.param1 * 0.4f : 0.0f;
    }

    float EffectsChain::processDistortionSample(float x) const
    {
        const float k = juce::jmax(1.0f, distortionDrive);
        const float deg = juce::MathConstants<float>::pi / 180.0f;
        const float raw = ((3.0f + k) * x * 20.0f * deg) / (juce::MathConstants<float>::pi + k * std::abs(x));
        return juce::jlimit(-0.85f, 0.85f, raw * 0.45f);
    }

    void EffectsChain::processBlock(juce::AudioBuffer<float>& buffer)
    {
        if (buffer.getNumSamples() == 0)
            return;

        for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
        {
            auto* dry = buffer.getWritePointer(ch);
            for (int i = 0; i < buffer.getNumSamples(); ++i)
            {
                const float delayed = delayLine.popSample(ch, delayTimeSamples, true);
                delayLine.pushSample(ch, dry[i] + delayed * delayFeedback);
                dry[i] = dry[i] * (1.0f - delayMix) + delayed * delayMix;
            }
        }

        juce::dsp::AudioBlock<float> block(buffer);
        juce::dsp::ProcessContextReplacing<float> context(block);

        chorus.process(context);
        phaser.process(context);
        flanger.process(context);
        reverb.process(context);

        if (distortionMix > 0.0f)
        {
            for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
            {
                auto* out = buffer.getWritePointer(ch);
                for (int i = 0; i < buffer.getNumSamples(); ++i)
                {
                    const float d = processDistortionSample(out[i]);
                    out[i] = out[i] * (1.0f - distortionMix) + d * distortionMix;
                }
            }
        }
    }
}

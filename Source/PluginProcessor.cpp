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

#include "ImageAnalyzer.h"

namespace photosynth
{
    namespace
    {
        constexpr juce::uint64 fnvPrime = 1099511628211ULL;
        constexpr juce::uint64 fnvOffset = 14695981039346656037ULL;

        inline float hueFromRgb(float r, float g, float b)
        {
            const float maxC = juce::jmax(r, juce::jmax(g, b));
            const float minC = juce::jmin(r, juce::jmin(g, b));
            const float delta = maxC - minC;
            if (delta <= 0.05f) return -1.0f;

            float hue = 0.0f;
            if (maxC == r) hue = std::fmod(((g - b) / delta), 6.0f);
            else if (maxC == g) hue = ((b - r) / delta) + 2.0f;
            else hue = ((r - g) / delta) + 4.0f;

            hue *= 60.0f;
            if (hue < 0.0f) hue += 360.0f;
            return hue;
        }
    }

    DeterministicRandom::DeterministicRandom(juce::uint64 seed)
        : state(seed == 0 ? 0x9E3779B97F4A7C15ULL : seed)
    {
    }

    float DeterministicRandom::nextFloat()
    {
        state += 0x9E3779B97F4A7C15ULL;
        juce::uint64 z = state;
        z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
        z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
        z = z ^ (z >> 31);
        return (float) ((double)(z & 0x1FFFFFFFFFFFFFULL) / (double)0x20000000000000ULL);
    }

    float DeterministicRandom::nextRange(float min, float max)
    {
        return min + (max - min) * nextFloat();
    }

    std::pair<juce::String, juce::uint64> ImageAnalyzer::calculateFNV1a64(const juce::Image::BitmapData& bitmap)
    {
        juce::uint64 hash = fnvOffset;
        const int pixelCount = bitmap.width * bitmap.height;
        const int step = juce::jmax(1, (pixelCount / 10000));

        for (int y = 0; y < bitmap.height; y += step)
        {
            for (int x = 0; x < bitmap.width; x += step)
            {
                auto c = bitmap.getPixelColour(x, y);
                hash ^= c.getRed(); hash *= fnvPrime;
                hash ^= c.getGreen(); hash *= fnvPrime;
                hash ^= c.getBlue(); hash *= fnvPrime;
            }
        }

        return { "0x" + juce::String::toHexString((juce::int64) hash).paddedLeft('0', 16).toUpperCase(), hash };
    }

    void ImageAnalyzer::computeColorStats(const juce::Image::BitmapData& bitmap,
                                          float& brightness,
                                          float& saturation,
                                          float& dominantHue,
                                          float& timbreDna,
                                          std::array<float, 7>& ratios,
                                          float& colorEntropy,
                                          std::vector<float>& hues,
                                          std::vector<float>& gray,
                                          int w,
                                          int h)
    {
        double lum = 0.0;
        double sat = 0.0;
        int countR = 0, countG = 0, countB = 0, countC = 0, countM = 0, countY = 0, countDark = 0;

        for (int y = 0; y < h; ++y)
        {
            for (int x = 0; x < w; ++x)
            {
                const auto c = bitmap.getPixelColour(x, y);
                const float r = c.getFloatRed();
                const float g = c.getFloatGreen();
                const float b = c.getFloatBlue();

                const float l = 0.299f * r + 0.587f * g + 0.114f * b;
                gray[(size_t)(y * w + x)] = l;
                lum += l;

                const float maxC = juce::jmax(r, juce::jmax(g, b));
                const float minC = juce::jmin(r, juce::jmin(g, b));
                const float delta = maxC - minC;
                const float s = maxC == 0.0f ? 0.0f : (delta / maxC);
                sat += s;

                if (maxC < 0.2f) ++countDark;

                const float hue = hueFromRgb(r, g, b);
                if (hue >= 0.0f)
                {
                    hues.push_back(hue);
                    if (hue >= 345.0f || hue < 25.0f) ++countR;
                    else if (hue < 65.0f) ++countY;
                    else if (hue < 160.0f) ++countG;
                    else if (hue < 210.0f) ++countC;
                    else if (hue < 275.0f) ++countB;
                    else ++countM;
                }
            }
        }

        const float total = (float) (w * h);
        brightness = juce::jlimit(0.0f, 1.0f, (float) (lum / total));
        saturation = juce::jlimit(0.0f, 1.0f, (float) (sat / total));

        dominantHue = 180.0f;
        timbreDna = 0.5f;
        if (!hues.empty())
        {
            double sum = 0.0;
            for (auto hVal : hues) sum += hVal;
            dominantHue = (float) (sum / (double) hues.size());

            double variance = 0.0;
            for (auto hVal : hues)
                variance += (hVal - dominantHue) * (hVal - dominantHue);
            variance /= (double) hues.size();
            timbreDna = juce::jlimit(0.0f, 1.0f, (float) (std::sqrt(variance) / 180.0));
        }

        ratios[0] = (float) countR / total;
        ratios[1] = (float) countG / total;
        ratios[2] = (float) countB / total;
        ratios[3] = (float) countC / total;
        ratios[4] = (float) countM / total;
        ratios[5] = (float) countY / total;
        ratios[6] = (float) countDark / total;

        float entropy = 0.0f;
        for (float v : ratios)
        {
            const float p = juce::jmax(0.0001f, v);
            entropy += p * std::log2(p);
        }
        colorEntropy = juce::jlimit(0.0f, 1.0f, -entropy / std::log2(7.0f));
    }

    float ImageAnalyzer::computeSobelComplexity(const juce::Image::BitmapData&, std::vector<float>& gray, int w, int h)
    {
        float edgeSum = 0.0f;
        for (int y = 1; y < h - 1; ++y)
        {
            for (int x = 1; x < w - 1; ++x)
            {
                const int idx = y * w + x;
                const float gx =
                    -gray[(size_t)(idx - w - 1)] + gray[(size_t)(idx - w + 1)]
                    -2.0f * gray[(size_t)(idx - 1)] + 2.0f * gray[(size_t)(idx + 1)]
                    -gray[(size_t)(idx + w - 1)] + gray[(size_t)(idx + w + 1)];

                const float gy =
                    -gray[(size_t)(idx - w - 1)] - 2.0f * gray[(size_t)(idx - w)] - gray[(size_t)(idx - w + 1)]
                     +gray[(size_t)(idx + w - 1)] + 2.0f * gray[(size_t)(idx + w)] + gray[(size_t)(idx + w + 1)];

                const float mag = std::sqrt(gx * gx + gy * gy);
                if (mag > 0.2f) edgeSum += mag;
            }
        }
        return juce::jlimit(0.0f, 1.0f, edgeSum / ((float)(w * h) * 0.4f));
    }

    TemporalEraInfo ImageAnalyzer::detectTemporalEra(float brightness,
                                                     float saturation,
                                                     float,
                                                     float microNoise,
                                                     float flatBlockRatio,
                                                     float earthyMutedness,
                                                     float edgeSharpness,
                                                     float gradientSmoothness,
                                                     const std::array<float, 7>& ratios,
                                                     float colorEntropy)
    {
        const float r = ratios[0], g = ratios[1], b = ratios[2], c = ratios[3], m = ratios[4], y = ratios[5], dark = ratios[6];

        const float score1800s = juce::jmax(0.0f, earthyMutedness * 0.45f + microNoise * 0.30f + (1.0f - saturation) * 0.25f + dark * 0.2f + y * 0.15f);
        const float warmTone = y + r * 0.4f;
        const float score1960s = juce::jmax(0.0f, warmTone * 0.4f + microNoise * 0.30f + (1.0f - std::abs(saturation - 0.35f)) * 0.25f);
        const float score1970s = juce::jmax(0.0f, r * 0.35f + m * 0.2f + (1.0f - std::abs(saturation - 0.45f)) * 0.25f);
        const float pop = c + m + y + juce::jmax(r, juce::jmax(g, b));
        const float score1980s = juce::jmax(0.0f, saturation * 0.50f + colorEntropy * 0.35f + pop * 0.25f);
        const float score2000s = juce::jmax(0.0f, edgeSharpness * 0.35f + flatBlockRatio * 0.40f + gradientSmoothness * 0.25f + (1.0f - microNoise) * 0.2f);

        const float total = juce::jmax(0.001f, score1800s + score1960s + score1970s + score1980s + score2000s);
        TemporalEraInfo info;
        info.weights.era1800s = score1800s / total;
        info.weights.era1960s = score1960s / total;
        info.weights.era1970s = score1970s / total;
        info.weights.era1980s = score1980s / total;
        info.weights.era2000s = score2000s / total;

        info.eraVal = juce::jlimit(0.0f, 1.0f,
            info.weights.era1800s * 0.05f + info.weights.era1960s * 0.25f + info.weights.era1970s * 0.5f + info.weights.era1980s * 0.75f + info.weights.era2000s * 0.95f);

        if (info.eraVal < 0.18f)
        {
            info.eraYear = EraYear::era1800s;
            info.label = "1800s Physical & Cathedral";
            info.architecture = "Harpsichord, Gut Lute & Cathedral Organ";
        }
        else if (info.eraVal < 0.38f)
        {
            info.eraYear = EraYear::era1960s;
            info.label = "1960s Drawbar & Combo Organ";
            info.architecture = "Hammond/Vox Drawbar Organ & Spring Tape";
        }
        else if (info.eraVal < 0.62f)
        {
            info.eraYear = EraYear::era1970s;
            info.label = "1970s Discrete Analog";
            info.architecture = "Moog Ladder & Fender Rhodes";
        }
        else if (info.eraVal < 0.82f)
        {
            info.eraYear = EraYear::era1980s;
            info.label = "1980s Polyphonic OB-X & DX7";
            info.architecture = "Oberheim OB-X & DX7 FM Bells";
        }
        else
        {
            info.eraYear = EraYear::era2000s;
            info.label = "2000s Digital Wavetable & Sampler";
            info.architecture = "Digital Wavetables & Modern Hybrid";
        }

        return info;
    }

    std::pair<ImageMetrics, PatchParameters> ImageAnalyzer::analyzeImage(const juce::Image& sourceImage)
    {
        juce::Image img = sourceImage;
        if (img.isNull())
            img = juce::Image(juce::Image::ARGB, 256, 256, true);

        if (img.getWidth() > 256 || img.getHeight() > 256)
            img = img.rescaled(juce::jmax(8, juce::jmin(256, img.getWidth())), juce::jmax(8, juce::jmin(256, img.getHeight())), juce::Graphics::mediumResamplingQuality);

        juce::Image::BitmapData bitmap(img, juce::Image::BitmapData::readOnly);

        ImageMetrics metrics;
        PatchParameters patch;

        std::vector<float> gray((size_t)(bitmap.width * bitmap.height), 0.0f);
        std::vector<float> hues;
        std::array<float, 7> ratios {};

        float colorEntropy = 0.5f;
        const auto [hashHex, seed] = calculateFNV1a64(bitmap);
        metrics.hash64 = hashHex;
        metrics.seedNumber = seed;

        computeColorStats(bitmap,
                          metrics.brightness,
                          metrics.saturation,
                          metrics.dominantHue,
                          metrics.timbreDna,
                          ratios,
                          colorEntropy,
                          hues,
                          gray,
                          bitmap.width,
                          bitmap.height);

        metrics.complexity = computeSobelComplexity(bitmap, gray, bitmap.width, bitmap.height);

        const float edgeSharpness = juce::jlimit(0.0f, 1.0f, metrics.complexity * 1.8f);
        float microNoise = 0.1f, flatBlockRatio = 0.2f, earthyMutedness = 0.2f, gradientSmoothness = 0.5f;

        int noisy = 0, flat = 0, earthy = 0, samples = 0;
        for (int y = 1; y < bitmap.height - 1; y += 2)
        {
            for (int x = 1; x < bitmap.width - 1; x += 2)
            {
                const int idx = y * bitmap.width + x;
                const float lum = gray[(size_t) idx];
                const float diff = std::abs(lum - gray[(size_t)(idx + 1)]);
                noisy += (diff > 0.01f && diff < 0.15f) ? 1 : 0;
                flat += (diff < 0.02f) ? 1 : 0;
                const auto c = bitmap.getPixelColour(x, y);
                const float h = hueFromRgb(c.getFloatRed(), c.getFloatGreen(), c.getFloatBlue());
                float hh = 0.0f, ss = 0.0f, bb = 0.0f;
                c.getHSB(hh, ss, bb);
                if (((h >= 10.0f && h <= 60.0f) && ss < 0.6f) || (lum < 0.35f && ss < 0.4f)) ++earthy;
                ++samples;
            }
        }

        if (samples > 0)
        {
            microNoise = juce::jlimit(0.0f, 1.0f, (float) noisy / (float) samples);
            flatBlockRatio = juce::jlimit(0.0f, 1.0f, (float) flat / (float) samples);
            earthyMutedness = juce::jlimit(0.0f, 1.0f, (float) earthy / (float) samples);
            gradientSmoothness = juce::jlimit(0.0f, 1.0f, 1.0f - microNoise * 1.5f);
        }

        metrics.temporalEra = detectTemporalEra(metrics.brightness,
                                                metrics.saturation,
                                                metrics.complexity,
                                                microNoise,
                                                flatBlockRatio,
                                                earthyMutedness,
                                                edgeSharpness,
                                                gradientSmoothness,
                                                ratios,
                                                colorEntropy);

        if (flatBlockRatio > 0.28f || (edgeSharpness > 0.40f && gradientSmoothness < 0.35f))
            metrics.archetype = SynthEngineType::fm_square_bell;
        else if ((microNoise > 0.30f && metrics.complexity > 0.35f) || (metrics.complexity > 0.5f))
            metrics.archetype = SynthEngineType::overdriven_saw_stack;
        else if (earthyMutedness > 0.30f || (metrics.brightness < 0.45f && metrics.saturation < 0.40f))
            metrics.archetype = SynthEngineType::acoustic_piano_organ;
        else
            metrics.archetype = SynthEngineType::hybrid_wavetable;

        const float r = ratios[0], g = ratios[1], b = ratios[2], c = ratios[3], m = ratios[4], y = ratios[5], dark = ratios[6];

        metrics.backgroundFeatures.opticalFocusDepth = juce::jlimit(0.02f, 0.98f, edgeSharpness * 0.5f + (1.0f - microNoise) * 0.5f);
        metrics.backgroundFeatures.gridSymmetryDensity = juce::jlimit(0.02f, 0.98f, flatBlockRatio * 0.4f + gradientSmoothness * 0.6f);
        metrics.backgroundFeatures.lightAzimuthAngle = 180.0f + (r - b) * 120.0f;
        metrics.backgroundFeatures.lightElevationAngle = juce::jlimit(10.0f, 85.0f, 85.0f - std::abs(metrics.brightness - 0.5f) * 70.0f);
        metrics.backgroundFeatures.chromaticClash = juce::jlimit(0.02f, 0.98f, colorEntropy * 0.7f + (c + m + y) * 0.3f);
        metrics.backgroundFeatures.semanticDensityWeight = juce::jlimit(0.02f, 0.98f, dark * 0.8f + earthyMutedness * 0.2f);
        metrics.backgroundFeatures.detectedMaterial = dark > 0.35f ? "stone" : (c > 0.25f ? "water" : (flatBlockRatio > 0.4f ? "glass" : "wood"));

        DeterministicRandom rng(seed);

        patch.engineType = metrics.archetype;
        patch.cutoffOffset = juce::jlimit(120.0f, 19500.0f, 150.0f + std::pow(metrics.brightness, 1.8f) * 16000.0f + metrics.complexity * 3200.0f);
        patch.resonance = juce::jlimit(0.1f, 10.0f, 0.5f + metrics.saturation * 6.5f + colorEntropy * 2.5f);
        patch.lfoRate = juce::jlimit(0.1f, 20.0f, 0.2f + metrics.complexity * 12.0f);
        patch.lfoDepth = juce::jlimit(0.0f, 1.0f, 0.15f + metrics.saturation * 0.55f + colorEntropy * 0.3f);

        patch.attackTime = juce::jlimit(0.001f, 5.0f, 0.001f + std::pow(1.0f - metrics.complexity, 2.5f) * 2.4f);
        patch.decayTime = juce::jlimit(0.01f, 10.0f, 0.08f + (1.0f - metrics.complexity * 0.6f) * 2.5f);
        patch.sustainLevel = juce::jlimit(0.0f, 1.0f, 0.15f + (1.0f - metrics.complexity * 0.8f) * 0.6f);
        patch.releaseTime = juce::jlimit(0.01f, 8.0f, 0.08f + (1.0f - metrics.complexity) * 3.0f);

        patch.fmRatio = juce::jlimit(0.5f, 8.0f, 1.0f + g * 5.0f + y * 2.0f + c * 2.0f + colorEntropy);
        patch.fmAmount = juce::jlimit(0.0f, 1.0f, r * 0.75f + m * 0.55f + metrics.saturation * 0.4f);
        patch.detuneCents = juce::jlimit(-50.0f, 50.0f, 2.0f + b * 38.0f + colorEntropy * 12.0f + (rng.nextFloat() - 0.5f) * 4.0f);
        patch.unisonVoices = juce::jlimit(1, 7, (int) std::round(1.0f + b * 4.0f + colorEntropy * 3.0f));
        patch.subOscLevel = juce::jlimit(0.0f, 1.0f, 0.05f + dark * 0.75f + r * 0.20f);
        patch.reverbMix = juce::jlimit(0.0f, 1.0f, 0.10f + (1.0f - metrics.brightness) * 0.50f + earthyMutedness * 0.30f);
        patch.delayMix = juce::jlimit(0.0f, 1.0f, 0.10f + metrics.complexity * 0.45f + c * 0.25f);

        patch.effects.delay.enabled = patch.delayMix > 0.15f;
        patch.effects.delay.intensity = patch.delayMix;
        patch.effects.delay.param1 = patch.delayMix;
        patch.effects.delay.param2 = patch.delayMix;

        patch.effects.reverb.enabled = patch.reverbMix > 0.15f;
        patch.effects.reverb.intensity = patch.reverbMix;
        patch.effects.reverb.param1 = patch.reverbMix;
        patch.effects.reverb.param2 = patch.reverbMix;

        patch.effects.chorus.enabled = true;
        patch.effects.chorus.intensity = juce::jlimit(0.1f, 1.0f, 0.2f + b * 0.6f + colorEntropy * 0.3f);
        patch.effects.chorus.param1 = 0.4f;
        patch.effects.chorus.param2 = 0.47f;

        patch.effects.phaser.enabled = true;
        patch.effects.phaser.intensity = juce::jlimit(0.1f, 1.0f, 0.15f + g * 0.6f + y * 0.3f);
        patch.effects.phaser.param1 = 0.19f;
        patch.effects.phaser.param2 = patch.effects.phaser.intensity;

        patch.effects.flanger.enabled = true;
        patch.effects.flanger.intensity = juce::jlimit(0.1f, 1.0f, 0.1f + c * 0.7f + edgeSharpness * 0.3f);
        patch.effects.flanger.param1 = 0.28f;
        patch.effects.flanger.param2 = patch.effects.flanger.intensity;

        patch.effects.distortion.enabled = true;
        patch.effects.distortion.intensity = juce::jlimit(0.1f, 1.0f, r * 0.8f + m * 0.4f);
        patch.effects.distortion.param1 = patch.effects.distortion.intensity;
        patch.effects.distortion.param2 = 0.3f;

        patch.physicalModel.bodyResonanceFreqs = { juce::jlimit(40.0f, 3000.0f, 140.0f + rng.nextRange(-30.0f, 30.0f)),
                                                   juce::jlimit(150.0f, 5000.0f, 480.0f + rng.nextRange(-60.0f, 60.0f)),
                                                   juce::jlimit(400.0f, 10000.0f, 1250.0f + rng.nextRange(-140.0f, 140.0f)) };
        patch.physicalModel.bodyDamping = juce::jlimit(0.05f, 0.95f, 0.15f + flatBlockRatio * 0.5f + gradientSmoothness * 0.3f);
        patch.physicalModel.acousticWeight = juce::jlimit(0.0f, 1.0f, 0.25f + microNoise * 0.4f + metrics.complexity * 0.35f);
        patch.physicalModel.tapeFlutterSpeed = juce::jlimit(0.1f, 3.0f, 0.2f + rng.nextRange(0.0f, 1.8f));
        patch.physicalModel.tapeFlutterDepth = juce::jlimit(0.0f, 1.0f, 0.05f + colorEntropy * 0.40f + microNoise * 0.35f);
        patch.physicalModel.analogSaturationWarmth = juce::jlimit(0.0f, 1.0f, 0.10f + metrics.saturation * 0.55f + r * 0.35f);

        patch.physicalModel.transientProfile.type = edgeSharpness > 0.50f ? "strike" : (earthyMutedness > 0.30f ? "hammer" : "pluck");
        patch.physicalModel.transientProfile.hardness = juce::jlimit(0.0f, 1.0f, edgeSharpness * 0.70f + metrics.complexity * 0.30f);
        patch.physicalModel.transientProfile.noiseBurst = juce::jlimit(0.0f, 1.0f, microNoise * 0.60f + (1.0f - gradientSmoothness) * 0.35f);

        patch.physicalModel.spatialReflection.roomSizeSeconds = juce::jlimit(0.2f, 6.0f, 0.3f + (1.0f - metrics.brightness) * 2.6f);
        patch.physicalModel.spatialReflection.absorption = juce::jlimit(0.05f, 0.95f, 0.10f + earthyMutedness * 0.55f + dark * 0.30f);
        patch.physicalModel.spatialReflection.diffusion = juce::jlimit(0.10f, 0.95f, 0.20f + colorEntropy * 0.50f + metrics.complexity * 0.30f);
        patch.physicalModel.spatialReflection.luminanceDepth = juce::jlimit(0.0f, 1.0f, std::abs(metrics.brightness - 0.5f) * 1.5f + (1.0f - flatBlockRatio) * 0.25f);

        patch.temporalEraVal = metrics.temporalEra.eraVal;
        patch.temporalEra = metrics.temporalEra;
        patch.opticalFocusDepth = metrics.backgroundFeatures.opticalFocusDepth;
        patch.gridSymmetryDensity = metrics.backgroundFeatures.gridSymmetryDensity;
        patch.lightAzimuthAngle = metrics.backgroundFeatures.lightAzimuthAngle;
        patch.lightElevationAngle = metrics.backgroundFeatures.lightElevationAngle;
        patch.chromaticClash = metrics.backgroundFeatures.chromaticClash;
        patch.semanticDensityWeight = metrics.backgroundFeatures.semanticDensityWeight;

        patch.customLfoProfile.resize(32);
        for (size_t i = 0; i < patch.customLfoProfile.size(); ++i)
        {
            const float t = (float) i / (float) patch.customLfoProfile.size();
            const float a = t * juce::MathConstants<float>::twoPi * 2.0f;
            patch.customLfoProfile[i] = juce::jlimit(-1.0f, 1.0f, std::sin(a) * metrics.complexity + std::cos(a * 0.7f) * metrics.saturation);
        }

        return { metrics, patch };
    }
}

#pragma once

#include <JuceHeader.h>
#include "CommonTypes.h"

namespace photosynth
{
    class DeterministicRandom
    {
    public:
        explicit DeterministicRandom(juce::uint64 seed);
        float nextFloat();
        float nextRange(float min, float max);

    private:
        juce::uint64 state;
    };

    class ImageAnalyzer
    {
    public:
        static std::pair<juce::String, juce::uint64> calculateFNV1a64(const juce::Image::BitmapData& bitmap);
        static std::pair<ImageMetrics, PatchParameters> analyzeImage(const juce::Image& sourceImage);

    private:
        static float computeSobelComplexity(const juce::Image::BitmapData& bitmap, std::vector<float>& gray, int w, int h);
        static void computeColorStats(const juce::Image::BitmapData& bitmap,
                                      float& brightness,
                                      float& saturation,
                                      float& dominantHue,
                                      float& timbreDna,
                                      std::array<float, 7>& ratios,
                                      float& colorEntropy,
                                      std::vector<float>& hues,
                                      std::vector<float>& gray,
                                      int w,
                                      int h);

        static TemporalEraInfo detectTemporalEra(float brightness,
                                                 float saturation,
                                                 float complexity,
                                                 float microNoise,
                                                 float flatBlockRatio,
                                                 float earthyMutedness,
                                                 float edgeSharpness,
                                                 float gradientSmoothness,
                                                 const std::array<float, 7>& ratios,
                                                 float colorEntropy);
    };
}

#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_audio_formats/juce_audio_formats.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_core/juce_core.h>
#include <juce_data_structures/juce_data_structures.h>
#include <juce_dsp/juce_dsp.h>
#include <juce_events/juce_events.h>
#include <juce_graphics/juce_graphics.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include <juce_gui_extra/juce_gui_extra.h>

#include "MorphEngine.h"

namespace photosynth
{
    float MorphEngine::lerp(float a, float b, float t)
    {
        return a + (b - a) * juce::jlimit(0.0f, 1.0f, t);
    }

    TemporalEraInfo MorphEngine::interpolateTemporalEra(const TemporalEraInfo& a,
                                                        const TemporalEraInfo& b,
                                                        float t)
    {
        TemporalEraInfo out;
        out.eraVal = lerp(a.eraVal, b.eraVal, t);
        out.weights.era1800s = lerp(a.weights.era1800s, b.weights.era1800s, t);
        out.weights.era1960s = lerp(a.weights.era1960s, b.weights.era1960s, t);
        out.weights.era1970s = lerp(a.weights.era1970s, b.weights.era1970s, t);
        out.weights.era1980s = lerp(a.weights.era1980s, b.weights.era1980s, t);
        out.weights.era2000s = lerp(a.weights.era2000s, b.weights.era2000s, t);

        if (out.eraVal < 0.16f)
        {
            out.eraYear = EraYear::era1800s;
            out.label = "1800s Physical & Cathedral";
            out.architecture = "Harpsichord, Gut Lute & Cathedral Organ";
        }
        else if (out.eraVal < 0.38f)
        {
            out.eraYear = EraYear::era1960s;
            out.label = "1960s Drawbar & Combo Organ";
            out.architecture = "Hammond/Vox Drawbar Organ & Spring Tape";
        }
        else if (out.eraVal < 0.62f)
        {
            out.eraYear = EraYear::era1970s;
            out.label = "1970s Discrete Analog";
            out.architecture = "Moog Ladder & Fender Rhodes";
        }
        else if (out.eraVal < 0.84f)
        {
            out.eraYear = EraYear::era1980s;
            out.label = "1980s Polyphonic OB-X & DX7";
            out.architecture = "Oberheim OB-X & DX7 FM Bells";
        }
        else
        {
            out.eraYear = EraYear::era2000s;
            out.label = "2000s Digital Wavetable & Sampler";
            out.architecture = "Digital Wavetables & Modern Hybrid";
        }
        return out;
    }

    PatchParameters MorphEngine::interpolatePatchParameters(const PatchParameters& a,
                                                            const PatchParameters& b,
                                                            float t)
    {
        PatchParameters out;
        const float x = juce::jlimit(0.0f, 1.0f, t);

        out.engineType = x < 0.5f ? a.engineType : b.engineType;
        out.cutoffOffset = std::round(lerp(a.cutoffOffset, b.cutoffOffset, x));
        out.resonance = lerp(a.resonance, b.resonance, x);
        out.lfoRate = lerp(a.lfoRate, b.lfoRate, x);
        out.lfoDepth = lerp(a.lfoDepth, b.lfoDepth, x);

        out.masterVolume = lerp(a.masterVolume, b.masterVolume, x);
        out.attackTime = lerp(a.attackTime, b.attackTime, x);
        out.decayTime = lerp(a.decayTime, b.decayTime, x);
        out.sustainLevel = lerp(a.sustainLevel, b.sustainLevel, x);
        out.releaseTime = lerp(a.releaseTime, b.releaseTime, x);
        out.limiterEnabled = x < 0.5f ? a.limiterEnabled : b.limiterEnabled;
        out.threshold = lerp(a.threshold, b.threshold, x);

        out.detuneCents = lerp(a.detuneCents, b.detuneCents, x);
        out.unisonVoices = (int) std::round(lerp((float) a.unisonVoices, (float) b.unisonVoices, x));
        out.fmRatio = lerp(a.fmRatio, b.fmRatio, x);
        out.fmAmount = lerp(a.fmAmount, b.fmAmount, x);
        out.subOscLevel = lerp(a.subOscLevel, b.subOscLevel, x);
        out.reverbMix = lerp(a.reverbMix, b.reverbMix, x);
        out.delayMix = lerp(a.delayMix, b.delayMix, x);

        out.customLfoProfile = a.customLfoProfile;
        if (!a.customLfoProfile.empty() && !b.customLfoProfile.empty())
        {
            const size_t len = juce::jmin(a.customLfoProfile.size(), b.customLfoProfile.size());
            out.customLfoProfile.resize(len);
            for (size_t i = 0; i < len; ++i)
                out.customLfoProfile[i] = lerp(a.customLfoProfile[i], b.customLfoProfile[i], x);
        }

        out.physicalModel = x < 0.5f ? a.physicalModel : b.physicalModel;
        for (int i = 0; i < 3; ++i)
            out.physicalModel.bodyResonanceFreqs[(size_t)i] = lerp(a.physicalModel.bodyResonanceFreqs[(size_t)i], b.physicalModel.bodyResonanceFreqs[(size_t)i], x);
        out.physicalModel.bodyDamping = lerp(a.physicalModel.bodyDamping, b.physicalModel.bodyDamping, x);
        out.physicalModel.acousticWeight = lerp(a.physicalModel.acousticWeight, b.physicalModel.acousticWeight, x);
        out.physicalModel.tapeFlutterSpeed = lerp(a.physicalModel.tapeFlutterSpeed, b.physicalModel.tapeFlutterSpeed, x);
        out.physicalModel.tapeFlutterDepth = lerp(a.physicalModel.tapeFlutterDepth, b.physicalModel.tapeFlutterDepth, x);
        out.physicalModel.analogSaturationWarmth = lerp(a.physicalModel.analogSaturationWarmth, b.physicalModel.analogSaturationWarmth, x);
        out.physicalModel.transientProfile.hardness = lerp(a.physicalModel.transientProfile.hardness, b.physicalModel.transientProfile.hardness, x);
        out.physicalModel.transientProfile.noiseBurst = lerp(a.physicalModel.transientProfile.noiseBurst, b.physicalModel.transientProfile.noiseBurst, x);

        auto blendEffect = [x](const EffectConfig& ea, const EffectConfig& eb)
        {
            EffectConfig e;
            e.enabled = x < 0.5f ? ea.enabled : eb.enabled;
            e.intensity = ea.intensity + (eb.intensity - ea.intensity) * x;
            e.param1 = ea.param1 + (eb.param1 - ea.param1) * x;
            e.param2 = ea.param2 + (eb.param2 - ea.param2) * x;
            return e;
        };

        out.effects.delay = blendEffect(a.effects.delay, b.effects.delay);
        out.effects.reverb = blendEffect(a.effects.reverb, b.effects.reverb);
        out.effects.chorus = blendEffect(a.effects.chorus, b.effects.chorus);
        out.effects.phaser = blendEffect(a.effects.phaser, b.effects.phaser);
        out.effects.flanger = blendEffect(a.effects.flanger, b.effects.flanger);
        out.effects.distortion = blendEffect(a.effects.distortion, b.effects.distortion);

        out.temporalEraVal = lerp(a.temporalEraVal, b.temporalEraVal, x);
        out.temporalEra = interpolateTemporalEra(a.temporalEra, b.temporalEra, x);

        out.opticalFocusDepth = lerp(a.opticalFocusDepth, b.opticalFocusDepth, x);
        out.gridSymmetryDensity = lerp(a.gridSymmetryDensity, b.gridSymmetryDensity, x);
        out.lightAzimuthAngle = std::round(lerp(a.lightAzimuthAngle, b.lightAzimuthAngle, x));
        out.lightElevationAngle = std::round(lerp(a.lightElevationAngle, b.lightElevationAngle, x));
        out.chromaticClash = lerp(a.chromaticClash, b.chromaticClash, x);
        out.semanticDensityWeight = lerp(a.semanticDensityWeight, b.semanticDensityWeight, x);

        return out;
    }

    ImageMetrics MorphEngine::interpolateImageMetrics(const ImageMetrics& a,
                                                      const ImageMetrics& b,
                                                      float t)
    {
        ImageMetrics out;
        const float x = juce::jlimit(0.0f, 1.0f, t);
        out.hash64 = x < 0.5f ? a.hash64 : b.hash64;
        out.seedNumber = x < 0.5f ? a.seedNumber : b.seedNumber;
        out.timbreDna = lerp(a.timbreDna, b.timbreDna, x);
        out.brightness = lerp(a.brightness, b.brightness, x);
        out.saturation = lerp(a.saturation, b.saturation, x);
        out.complexity = lerp(a.complexity, b.complexity, x);
        out.dominantHue = std::round(lerp(a.dominantHue, b.dominantHue, x));
        out.archetype = x < 0.5f ? a.archetype : b.archetype;
        out.temporalEra = interpolateTemporalEra(a.temporalEra, b.temporalEra, x);
        out.backgroundFeatures.opticalFocusDepth = lerp(a.backgroundFeatures.opticalFocusDepth, b.backgroundFeatures.opticalFocusDepth, x);
        out.backgroundFeatures.gridSymmetryDensity = lerp(a.backgroundFeatures.gridSymmetryDensity, b.backgroundFeatures.gridSymmetryDensity, x);
        out.backgroundFeatures.lightAzimuthAngle = std::round(lerp(a.backgroundFeatures.lightAzimuthAngle, b.backgroundFeatures.lightAzimuthAngle, x));
        out.backgroundFeatures.lightElevationAngle = std::round(lerp(a.backgroundFeatures.lightElevationAngle, b.backgroundFeatures.lightElevationAngle, x));
        out.backgroundFeatures.chromaticClash = lerp(a.backgroundFeatures.chromaticClash, b.backgroundFeatures.chromaticClash, x);
        out.backgroundFeatures.semanticDensityWeight = lerp(a.backgroundFeatures.semanticDensityWeight, b.backgroundFeatures.semanticDensityWeight, x);
        out.backgroundFeatures.detectedMaterial = x < 0.5f ? a.backgroundFeatures.detectedMaterial : b.backgroundFeatures.detectedMaterial;
        return out;
    }
}

#pragma once

#include "CommonTypes.h"

namespace photosynth
{
    class MorphEngine
    {
    public:
        static PatchParameters interpolatePatchParameters(const PatchParameters& a,
                                                          const PatchParameters& b,
                                                          float t);

        static ImageMetrics interpolateImageMetrics(const ImageMetrics& a,
                                                    const ImageMetrics& b,
                                                    float t);

    private:
        static TemporalEraInfo interpolateTemporalEra(const TemporalEraInfo& a,
                                                      const TemporalEraInfo& b,
                                                      float t);
        static float lerp(float a, float b, float t);
    };
}

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

#include "PluginEditor.h"

namespace photosynth
{
    void RadialGauge::paint(juce::Graphics& g)
    {
        auto r = getLocalBounds().toFloat().reduced(4.0f);
        const auto c = r.getCentre();
        const float radius = juce::jmin(r.getWidth(), r.getHeight()) * 0.5f - 8.0f;

        g.setColour(juce::Colour(0xff151b23));
        g.fillEllipse(c.x - radius, c.y - radius, radius * 2.0f, radius * 2.0f);

        juce::Path p;
        const float start = juce::MathConstants<float>::pi * 0.75f;
        const float end = start + juce::MathConstants<float>::pi * 1.5f * value;
        p.addCentredArc(c.x, c.y, radius, radius, 0.0f, start, end, true);

        g.setColour(juce::Colours::white.withAlpha(0.12f));
        g.drawEllipse(c.x - radius, c.y - radius, radius * 2.0f, radius * 2.0f, 3.0f);

        g.setColour(color);
        g.strokePath(p, juce::PathStrokeType(4.0f));

        g.setColour(juce::Colours::white);
        g.setFont(juce::Font(12.0f, juce::Font::bold));
        g.drawFittedText(juce::String((int) std::round(value * 100.0f)) + "%", getLocalBounds().reduced(8), juce::Justification::centred, 1);

        g.setFont(juce::Font(10.0f));
        g.drawFittedText(label, getLocalBounds().removeFromBottom(14), juce::Justification::centred, 1);
    }

    PhotoSynthAudioProcessorEditor::PhotoSynthAudioProcessorEditor(PhotoSynthAudioProcessor& p)
        : AudioProcessorEditor(&p),
          processor(p),
          keyboard(processor.getKeyboardState(), juce::MidiKeyboardComponent::horizontalKeyboard)
    {
        setSize(1280, 760);

        addAndMakeVisible(timbreGauge);
        addAndMakeVisible(brightnessGauge);
        addAndMakeVisible(saturationGauge);
        addAndMakeVisible(complexityGauge);

        dropzoneLabel.setText("Drop image here or click Load Image", juce::dontSendNotification);
        dropzoneLabel.setJustificationType(juce::Justification::centred);
        dropzoneLabel.setColour(juce::Label::textColourId, juce::Colours::white.withAlpha(0.75f));
        addAndMakeVisible(dropzoneLabel);

        addAndMakeVisible(loadImageButton);
        loadImageButton.onClick = [this]
        {
            auto f = juce::File::getSpecialLocation(juce::File::userDesktopDirectory).getChildFile("photo_synth_input.png");
            if (f.existsAsFile())
                processor.loadImageFile(f);
        };

        addAndMakeVisible(savePresetButton);
        savePresetButton.onClick = [this]
        {
            auto f = juce::File::getSpecialLocation(juce::File::userDocumentsDirectory).getChildFile("PhotoSynthPreset.photosynthpreset");
            processor.savePresetToFile(f);
        };

        addAndMakeVisible(loadPresetButton);
        loadPresetButton.onClick = [this]
        {
            auto f = juce::File::getSpecialLocation(juce::File::userDocumentsDirectory).getChildFile("PhotoSynthPreset.photosynthpreset");
            if (f.existsAsFile())
                processor.loadPresetFromFile(f);
        };

        addAndMakeVisible(oscilloscope);
        oscilloscope.setBufferSize(512);
        oscilloscope.setSamplesPerBlock(32);
        oscilloscope.setColours(juce::Colours::black, juce::Colours::cyan);

        addAndMakeVisible(keyboard);
        keyboard.setAvailableRange(24, 108);

        addAndMakeVisible(engineType);
        engineType.addItemList({ "analog_brass", "digital_fm_bells", "hybrid_wavetable", "acoustic_piano_organ", "overdriven_saw_stack", "fm_square_bell" }, 1);

        configureKnob(cutoff, "Cutoff");
        configureKnob(resonance, "Resonance");
        configureKnob(lfoRate, "LFO Rate");
        configureKnob(lfoDepth, "LFO Depth");
        configureKnob(volume, "Master Volume");
        configureKnob(attack, "Attack");
        configureKnob(decay, "Decay");
        configureKnob(sustain, "Sustain");
        configureKnob(release, "Release");
        configureKnob(threshold, "Threshold");

        addAndMakeVisible(limiterButton);

        auto& apvts = processor.apvts;
        cutoffAtt = std::make_unique<SliderAttachment>(apvts, "cutoffOffset", cutoff);
        resonanceAtt = std::make_unique<SliderAttachment>(apvts, "resonance", resonance);
        lfoRateAtt = std::make_unique<SliderAttachment>(apvts, "lfoRate", lfoRate);
        lfoDepthAtt = std::make_unique<SliderAttachment>(apvts, "lfoDepth", lfoDepth);
        volumeAtt = std::make_unique<SliderAttachment>(apvts, "masterVolume", volume);
        attackAtt = std::make_unique<SliderAttachment>(apvts, "attackTime", attack);
        decayAtt = std::make_unique<SliderAttachment>(apvts, "decayTime", decay);
        sustainAtt = std::make_unique<SliderAttachment>(apvts, "sustainLevel", sustain);
        releaseAtt = std::make_unique<SliderAttachment>(apvts, "releaseTime", release);
        thresholdAtt = std::make_unique<SliderAttachment>(apvts, "threshold", threshold);

        limiterAtt = std::make_unique<ButtonAttachment>(apvts, "limiterEnabled", limiterButton);
        engineAtt = std::make_unique<ComboBoxAttachment>(apvts, "engineType", engineType);

        startTimerHz(30);
    }

    void PhotoSynthAudioProcessorEditor::configureKnob(juce::Slider& slider, const juce::String& name)
    {
        slider.setName(name);
        slider.setSliderStyle(juce::Slider::RotaryHorizontalVerticalDrag);
        slider.setTextBoxStyle(juce::Slider::TextBoxBelow, false, 72, 18);
        slider.setColour(juce::Slider::rotarySliderFillColourId, juce::Colours::cyan.withAlpha(0.8f));
        slider.setColour(juce::Slider::thumbColourId, juce::Colours::white);
        addAndMakeVisible(slider);
    }

    bool PhotoSynthAudioProcessorEditor::isInterestedInFileDrag(const juce::StringArray& files)
    {
        if (files.isEmpty())
            return false;

        const auto ext = juce::File(files[0]).getFileExtension().toLowerCase();
        return ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp" || ext == ".bmp";
    }

    void PhotoSynthAudioProcessorEditor::filesDropped(const juce::StringArray& files, int, int)
    {
        if (!files.isEmpty())
            processor.loadImageFile(juce::File(files[0]));
    }

    void PhotoSynthAudioProcessorEditor::timerCallback()
    {
        const auto& m = processor.getMetrics();
        timbreGauge.setValue(m.timbreDna);
        brightnessGauge.setValue(m.brightness);
        saturationGauge.setValue(m.saturation);
        complexityGauge.setValue(m.complexity);

        juce::AudioBuffer<float> scope;
        processor.getScopeData(scope);
        if (scope.getNumSamples() > 0)
            oscilloscope.pushBuffer(scope);
    }

    void PhotoSynthAudioProcessorEditor::paint(juce::Graphics& g)
    {
        g.fillAll(juce::Colour(0xff0b1119));

        g.setColour(juce::Colours::white);
        g.setFont(juce::Font(26.0f, juce::Font::bold));
        g.drawText("PHOTO SYNTH", 20, 12, 320, 36, juce::Justification::left);

        g.setColour(juce::Colours::cyan.withAlpha(0.4f));
        g.drawFittedText("Image-to-Synth Morphing Instrument", 24, 44, 360, 20, juce::Justification::left, 1);

        g.setColour(juce::Colour(0xff141b26));
        g.fillRoundedRectangle(dropzone.toFloat(), 10.0f);
        g.setColour(juce::Colours::cyan.withAlpha(0.45f));
        g.drawRoundedRectangle(dropzone.toFloat(), 10.0f, 2.0f);

        g.setColour(juce::Colour(0xff11161f));
        g.fillRoundedRectangle(juce::Rectangle<float>(22.0f, 80.0f, 240.0f, 280.0f), 10.0f);

        g.setColour(juce::Colour(0xff11161f));
        g.fillRoundedRectangle(juce::Rectangle<float>((float)getWidth() - 450.0f, 80.0f, 428.0f, 540.0f), 10.0f);
    }

    void PhotoSynthAudioProcessorEditor::resized()
    {
        const int margin = 20;

        auto area = getLocalBounds().reduced(margin);
        auto top = area.removeFromTop(60);
        juce::ignoreUnused(top);

        auto leftPanel = area.removeFromLeft(250);
        auto centerPanel = area.removeFromLeft(520);
        auto rightPanel = area;

        auto gArea = leftPanel.reduced(10);
        timbreGauge.setBounds(gArea.removeFromTop(125));
        brightnessGauge.setBounds(gArea.removeFromTop(125));
        saturationGauge.setBounds(gArea.removeFromTop(125));
        complexityGauge.setBounds(gArea.removeFromTop(125));

        dropzone = centerPanel.removeFromTop(360).reduced(10);
        dropzoneLabel.setBounds(dropzone.reduced(18));

        auto controls = centerPanel.removeFromTop(40).reduced(10, 0);
        loadImageButton.setBounds(controls.removeFromLeft(150));
        savePresetButton.setBounds(controls.removeFromLeft(150).translated(8, 0));
        loadPresetButton.setBounds(controls.removeFromLeft(150).translated(16, 0));

        oscilloscope.setBounds(centerPanel.removeFromTop(160).reduced(10));
        keyboard.setBounds(centerPanel.removeFromTop(80).reduced(10, 8));

        auto rightTop = rightPanel.removeFromTop(36);
        engineType.setBounds(rightTop.removeFromLeft(260));
        limiterButton.setBounds(rightTop.removeFromLeft(120));

        auto grid = rightPanel.reduced(8);
        const int knobW = 100, knobH = 120, gapX = 6;

        auto row1 = grid.removeFromTop(knobH);
        cutoff.setBounds(row1.removeFromLeft(knobW));
        row1.removeFromLeft(gapX);
        resonance.setBounds(row1.removeFromLeft(knobW));
        row1.removeFromLeft(gapX);
        lfoRate.setBounds(row1.removeFromLeft(knobW));
        row1.removeFromLeft(gapX);
        lfoDepth.setBounds(row1.removeFromLeft(knobW));

        auto row2 = grid.removeFromTop(knobH);
        volume.setBounds(row2.removeFromLeft(knobW));
        row2.removeFromLeft(gapX);
        attack.setBounds(row2.removeFromLeft(knobW));
        row2.removeFromLeft(gapX);
        decay.setBounds(row2.removeFromLeft(knobW));
        row2.removeFromLeft(gapX);
        sustain.setBounds(row2.removeFromLeft(knobW));

        auto row3 = grid.removeFromTop(knobH);
        release.setBounds(row3.removeFromLeft(knobW));
        row3.removeFromLeft(gapX);
        threshold.setBounds(row3.removeFromLeft(knobW));
    }
}

#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"

namespace photosynth
{
    class RadialGauge : public juce::Component
    {
    public:
        RadialGauge(juce::String title, juce::Colour accent) : label(std::move(title)), color(accent) {}
        void setValue(float v) { value = juce::jlimit(0.0f, 1.0f, v); repaint(); }
        void paint(juce::Graphics& g) override;

    private:
        juce::String label;
        juce::Colour color;
        float value = 0.0f;
    };

    class PhotoSynthAudioProcessorEditor : public juce::AudioProcessorEditor,
                                           public juce::FileDragAndDropTarget,
                                           private juce::Timer
    {
    public:
        explicit PhotoSynthAudioProcessorEditor(PhotoSynthAudioProcessor&);
        ~PhotoSynthAudioProcessorEditor() override = default;

        void paint(juce::Graphics&) override;
        void resized() override;

        bool isInterestedInFileDrag(const juce::StringArray& files) override;
        void filesDropped(const juce::StringArray& files, int x, int y) override;

    private:
        using SliderAttachment = juce::AudioProcessorValueTreeState::SliderAttachment;
        using ButtonAttachment = juce::AudioProcessorValueTreeState::ButtonAttachment;
        using ComboBoxAttachment = juce::AudioProcessorValueTreeState::ComboBoxAttachment;

        PhotoSynthAudioProcessor& processor;

        RadialGauge timbreGauge { "TIMBRE DNA", juce::Colours::cyan };
        RadialGauge brightnessGauge { "BRIGHTNESS", juce::Colours::orange };
        RadialGauge saturationGauge { "SATURATION", juce::Colours::deeppink };
        RadialGauge complexityGauge { "COMPLEXITY", juce::Colours::limegreen };

        juce::TextButton loadImageButton { "Load Image" };
        juce::TextButton savePresetButton { "Save Preset" };
        juce::TextButton loadPresetButton { "Load Preset" };
        juce::Label dropzoneLabel;

        juce::AudioVisualiserComponent oscilloscope { 2 };
        juce::MidiKeyboardComponent keyboard;

        juce::ComboBox engineType;
        juce::ToggleButton limiterButton { "Limiter" };

        juce::Slider cutoff, resonance, lfoRate, lfoDepth;
        juce::Slider volume, attack, decay, sustain, release, threshold;

        std::unique_ptr<SliderAttachment> cutoffAtt, resonanceAtt, lfoRateAtt, lfoDepthAtt;
        std::unique_ptr<SliderAttachment> volumeAtt, attackAtt, decayAtt, sustainAtt, releaseAtt, thresholdAtt;
        std::unique_ptr<ButtonAttachment> limiterAtt;
        std::unique_ptr<ComboBoxAttachment> engineAtt;

        juce::Rectangle<int> dropzone;

        void timerCallback() override;
        void configureKnob(juce::Slider& slider, const juce::String& name);

        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PhotoSynthAudioProcessorEditor)
    };
}

#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace photosynth
{
    namespace
    {
        constexpr float kLimiterThresholdDefault = -3.0f;
        constexpr float kLimiterRatio = 20.0f;
        constexpr float kLimiterAttackMs = 0.5f;

        juce::StringArray engineChoices()
        {
            return { "analog_brass", "digital_fm_bells", "hybrid_wavetable", "acoustic_piano_organ", "overdriven_saw_stack", "fm_square_bell" };
        }
    }

    PhotoSynthAudioProcessor::PhotoSynthAudioProcessor()
      : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true)),
        apvts(*this, nullptr, "PARAMS", createParameterLayout())
    {
        masterClipper.functionToUse = [](float x) { return std::tanh(x); };
        scopeBuffer.setSize(2, 2048);
        scopeBuffer.clear();
    }

    bool PhotoSynthAudioProcessor::isBusesLayoutSupported(const BusesLayout& layouts) const
    {
        return layouts.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
    }

    juce::AudioProcessorValueTreeState::ParameterLayout PhotoSynthAudioProcessor::createParameterLayout()
    {
        using APF = juce::AudioParameterFloat;
        using APB = juce::AudioParameterBool;
        using APC = juce::AudioParameterChoice;

        std::vector<std::unique_ptr<juce::RangedAudioParameter>> p;

        p.push_back(std::make_unique<APF>(juce::ParameterID{"cutoffOffset", 1}, "Cutoff Offset", juce::NormalisableRange<float>(20.0f, 20000.0f, 1.0f, 0.3f), 2500.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"resonance", 1}, "Resonance", juce::NormalisableRange<float>(0.0f, 10.0f, 0.01f), 1.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"lfoRate", 1}, "LFO Rate", juce::NormalisableRange<float>(0.1f, 20.0f, 0.01f), 2.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"lfoDepth", 1}, "LFO Depth", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.2f));

        p.push_back(std::make_unique<APF>(juce::ParameterID{"masterVolume", 1}, "Master Volume", juce::NormalisableRange<float>(-60.0f, 6.0f, 0.01f), -3.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"attackTime", 1}, "Attack", juce::NormalisableRange<float>(0.001f, 5.0f, 0.001f, 0.4f), 0.01f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"decayTime", 1}, "Decay", juce::NormalisableRange<float>(0.01f, 10.0f, 0.001f, 0.4f), 0.8f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"sustainLevel", 1}, "Sustain", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.7f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"releaseTime", 1}, "Release", juce::NormalisableRange<float>(0.01f, 8.0f, 0.001f, 0.4f), 0.4f));
        p.push_back(std::make_unique<APB>(juce::ParameterID{"limiterEnabled", 1}, "Limiter Enabled", true));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"threshold", 1}, "Threshold", juce::NormalisableRange<float>(-30.0f, 0.0f, 0.01f), -3.0f));

        p.push_back(std::make_unique<APC>(juce::ParameterID{"engineType", 1}, "Engine Type", engineChoices(), 2));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"detuneCents", 1}, "Detune Cents", juce::NormalisableRange<float>(-50.0f, 50.0f, 0.01f), 5.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"unisonVoices", 1}, "Unison Voices", juce::NormalisableRange<float>(1.0f, 7.0f, 1.0f), 2.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"fmRatio", 1}, "FM Ratio", juce::NormalisableRange<float>(0.5f, 8.0f, 0.001f), 2.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"fmAmount", 1}, "FM Amount", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.35f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"subOscLevel", 1}, "Sub Osc", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.3f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"reverbMix", 1}, "Reverb Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.35f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"delayMix", 1}, "Delay Mix", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.25f));

        auto addFx = [&p](const juce::String& idPrefix)
        {
            p.push_back(std::make_unique<APB>(juce::ParameterID{ idPrefix + "Enabled", 1 }, idPrefix + " Enabled", true));
            p.push_back(std::make_unique<APF>(juce::ParameterID{ idPrefix + "Intensity", 1 }, idPrefix + " Intensity", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
            p.push_back(std::make_unique<APF>(juce::ParameterID{ idPrefix + "Param1", 1 }, idPrefix + " Param1", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
            p.push_back(std::make_unique<APF>(juce::ParameterID{ idPrefix + "Param2", 1 }, idPrefix + " Param2", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
        };

        addFx("delay");
        addFx("reverb");
        addFx("chorus");
        addFx("phaser");
        addFx("flanger");
        addFx("distortion");

        p.push_back(std::make_unique<APF>(juce::ParameterID{"temporalEraVal", 1}, "Temporal Era", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"opticalFocusDepth", 1}, "Optical Focus", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"gridSymmetryDensity", 1}, "Grid Symmetry", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"lightAzimuthAngle", 1}, "Light Azimuth", juce::NormalisableRange<float>(0.0f, 360.0f, 0.01f), 180.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"lightElevationAngle", 1}, "Light Elevation", juce::NormalisableRange<float>(0.0f, 90.0f, 0.01f), 45.0f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"chromaticClash", 1}, "Chromatic Clash", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.2f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"semanticDensityWeight", 1}, "Semantic Density", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.5f));

        p.push_back(std::make_unique<APF>(juce::ParameterID{"bodyDamping", 1}, "Body Damping", juce::NormalisableRange<float>(0.05f, 0.95f, 0.001f), 0.3f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"acousticWeight", 1}, "Acoustic Weight", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.25f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"tapeFlutterSpeed", 1}, "Flutter Speed", juce::NormalisableRange<float>(0.1f, 3.0f, 0.001f), 0.8f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"tapeFlutterDepth", 1}, "Flutter Depth", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.08f));
        p.push_back(std::make_unique<APF>(juce::ParameterID{"analogSaturationWarmth", 1}, "Analog Warmth", juce::NormalisableRange<float>(0.0f, 1.0f, 0.001f), 0.3f));

        return { p.begin(), p.end() };
    }

    void PhotoSynthAudioProcessor::prepareToPlay(double sampleRate, int samplesPerBlock)
    {
        juce::dsp::ProcessSpec spec { sampleRate, (juce::uint32) samplesPerBlock, 2 };
        synthEngine.prepare(sampleRate, samplesPerBlock, 2);
        physicalModeling.prepare(spec);
        effectsChain.prepare(spec);

        limiter.prepare(spec);
        limiter.setThreshold(kLimiterThresholdDefault);
        limiter.setRatio(kLimiterRatio);
        limiter.setAttack(kLimiterAttackMs);
        limiter.setRelease(80.0f);

        masterClipper.prepare(spec);
        masterGainSmoothed.reset(sampleRate, 0.02);
        masterGainSmoothed.setCurrentAndTargetValue(juce::Decibels::decibelsToGain(-3.0f));

        updatePatchFromParameters();
    }

    void PhotoSynthAudioProcessor::releaseResources() {}

    void PhotoSynthAudioProcessor::updatePatchFromParameters()
    {
        auto getF = [this](const char* id) { return apvts.getRawParameterValue(id)->load(); };

        currentPatch.cutoffOffset = getF("cutoffOffset");
        currentPatch.resonance = getF("resonance");
        currentPatch.lfoRate = getF("lfoRate");
        currentPatch.lfoDepth = getF("lfoDepth");

        currentPatch.masterVolume = getF("masterVolume");
        currentPatch.attackTime = getF("attackTime");
        currentPatch.decayTime = getF("decayTime");
        currentPatch.sustainLevel = getF("sustainLevel");
        currentPatch.releaseTime = getF("releaseTime");
        currentPatch.limiterEnabled = getF("limiterEnabled") > 0.5f;
        currentPatch.threshold = getF("threshold");

        currentPatch.engineType = engineFromFloat(getF("engineType"));
        currentPatch.detuneCents = getF("detuneCents");
        currentPatch.unisonVoices = (int) std::round(getF("unisonVoices"));
        currentPatch.fmRatio = getF("fmRatio");
        currentPatch.fmAmount = getF("fmAmount");
        currentPatch.subOscLevel = getF("subOscLevel");
        currentPatch.reverbMix = getF("reverbMix");
        currentPatch.delayMix = getF("delayMix");

        auto setFx = [this, &getF](const char* prefix, EffectConfig& fx)
        {
            fx.enabled = getF((juce::String(prefix) + "Enabled").toRawUTF8()) > 0.5f;
            fx.intensity = getF((juce::String(prefix) + "Intensity").toRawUTF8());
            fx.param1 = getF((juce::String(prefix) + "Param1").toRawUTF8());
            fx.param2 = getF((juce::String(prefix) + "Param2").toRawUTF8());
        };

        setFx("delay", currentPatch.effects.delay);
        setFx("reverb", currentPatch.effects.reverb);
        setFx("chorus", currentPatch.effects.chorus);
        setFx("phaser", currentPatch.effects.phaser);
        setFx("flanger", currentPatch.effects.flanger);
        setFx("distortion", currentPatch.effects.distortion);

        currentPatch.temporalEraVal = getF("temporalEraVal");
        currentPatch.opticalFocusDepth = getF("opticalFocusDepth");
        currentPatch.gridSymmetryDensity = getF("gridSymmetryDensity");
        currentPatch.lightAzimuthAngle = getF("lightAzimuthAngle");
        currentPatch.lightElevationAngle = getF("lightElevationAngle");
        currentPatch.chromaticClash = getF("chromaticClash");
        currentPatch.semanticDensityWeight = getF("semanticDensityWeight");

        currentPatch.physicalModel.bodyDamping = getF("bodyDamping");
        currentPatch.physicalModel.acousticWeight = getF("acousticWeight");
        currentPatch.physicalModel.tapeFlutterSpeed = getF("tapeFlutterSpeed");
        currentPatch.physicalModel.tapeFlutterDepth = getF("tapeFlutterDepth");
        currentPatch.physicalModel.analogSaturationWarmth = getF("analogSaturationWarmth");

        synthEngine.setPatch(currentPatch);
        synthEngine.setMetrics(currentMetrics);
        physicalModeling.updateFromPatch(currentPatch, getSampleRate());
        effectsChain.updateFromPatch(currentPatch, getSampleRate());

        masterGainSmoothed.setTargetValue(juce::Decibels::decibelsToGain(currentPatch.masterVolume));
    }

    void PhotoSynthAudioProcessor::pushScope(const juce::AudioBuffer<float>& block)
    {
        const juce::ScopedLock sl(scopeLock);
        const int n = juce::jmin(scopeBuffer.getNumSamples(), block.getNumSamples());
        for (int ch = 0; ch < juce::jmin(scopeBuffer.getNumChannels(), block.getNumChannels()); ++ch)
            scopeBuffer.copyFrom(ch, 0, block, ch, block.getNumSamples() - n, n);
    }

    void PhotoSynthAudioProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
    {
        juce::ScopedNoDenormals noDenormals;

        for (int i = getTotalNumInputChannels(); i < getTotalNumOutputChannels(); ++i)
            buffer.clear(i, 0, buffer.getNumSamples());

        keyboardState.processNextMidiBuffer(midiMessages, 0, buffer.getNumSamples(), true);

        updatePatchFromParameters();

        buffer.clear();
        synthEngine.render(buffer, midiMessages);

        physicalModeling.processBlock(buffer);
        effectsChain.processBlock(buffer);

        buffer.applyGainRamp(0, buffer.getNumSamples(), masterGainSmoothed.getCurrentValue(), masterGainSmoothed.getTargetValue());

        limiter.setThreshold(currentPatch.limiterEnabled ? currentPatch.threshold : -0.5f);
        limiter.setRatio(currentPatch.limiterEnabled ? 20.0f : 12.0f);

        juce::dsp::AudioBlock<float> block(buffer);
        juce::dsp::ProcessContextReplacing<float> context(block);
        limiter.process(context);
        masterClipper.process(context);

        pushScope(buffer);
    }

    void PhotoSynthAudioProcessor::loadImageFile(const juce::File& file)
    {
        auto img = juce::ImageFileFormat::loadFrom(file);
        if (img.isNull())
            return;

        const auto result = ImageAnalyzer::analyzeImage(img);
        currentMetrics = result.first;
        currentPatch = result.second;

        auto setF = [this](const char* id, float value)
        {
            if (auto* param = apvts.getParameter(id))
                param->setValueNotifyingHost(param->convertTo0to1(value));
        };

        setF("cutoffOffset", currentPatch.cutoffOffset);
        setF("resonance", currentPatch.resonance);
        setF("lfoRate", currentPatch.lfoRate);
        setF("lfoDepth", currentPatch.lfoDepth);
        setF("attackTime", currentPatch.attackTime);
        setF("decayTime", currentPatch.decayTime);
        setF("sustainLevel", currentPatch.sustainLevel);
        setF("releaseTime", currentPatch.releaseTime);
        setF("detuneCents", currentPatch.detuneCents);
        setF("unisonVoices", (float) currentPatch.unisonVoices);
        setF("fmRatio", currentPatch.fmRatio);
        setF("fmAmount", currentPatch.fmAmount);
        setF("subOscLevel", currentPatch.subOscLevel);
        setF("reverbMix", currentPatch.reverbMix);
        setF("delayMix", currentPatch.delayMix);
        setF("temporalEraVal", currentPatch.temporalEraVal);
        setF("opticalFocusDepth", currentPatch.opticalFocusDepth);
        setF("gridSymmetryDensity", currentPatch.gridSymmetryDensity);
        setF("lightAzimuthAngle", currentPatch.lightAzimuthAngle);
        setF("lightElevationAngle", currentPatch.lightElevationAngle);
        setF("chromaticClash", currentPatch.chromaticClash);
        setF("semanticDensityWeight", currentPatch.semanticDensityWeight);

        if (auto* engineParam = apvts.getParameter("engineType"))
            engineParam->setValueNotifyingHost(engineParam->convertTo0to1((float) currentPatch.engineType));

        updatePatchFromParameters();
    }

    void PhotoSynthAudioProcessor::savePresetToFile(const juce::File& file)
    {
        auto state = apvts.copyState();
        state.setProperty("imageHash", currentMetrics.hash64, nullptr);
        state.setProperty("seedNumber", (juce::int64) currentMetrics.seedNumber, nullptr);

        std::unique_ptr<juce::XmlElement> xml(state.createXml());
        if (xml != nullptr)
            xml->writeTo(file);
    }

    void PhotoSynthAudioProcessor::loadPresetFromFile(const juce::File& file)
    {
        std::unique_ptr<juce::XmlElement> xml(juce::XmlDocument::parse(file));
        if (xml == nullptr)
            return;

        if (xml->hasTagName(apvts.state.getType().toString()))
            apvts.replaceState(juce::ValueTree::fromXml(*xml));

        updatePatchFromParameters();
    }

    void PhotoSynthAudioProcessor::getScopeData(juce::AudioBuffer<float>& target)
    {
        const juce::ScopedLock sl(scopeLock);
        target.makeCopyOf(scopeBuffer, true);
    }

    void PhotoSynthAudioProcessor::getStateInformation(juce::MemoryBlock& destData)
    {
        std::unique_ptr<juce::XmlElement> xml(apvts.copyState().createXml());
        copyXmlToBinary(*xml, destData);
    }

    void PhotoSynthAudioProcessor::setStateInformation(const void* data, int sizeInBytes)
    {
        std::unique_ptr<juce::XmlElement> xml(getXmlFromBinary(data, sizeInBytes));
        if (xml != nullptr && xml->hasTagName(apvts.state.getType()))
            apvts.replaceState(juce::ValueTree::fromXml(*xml));

        updatePatchFromParameters();
    }

    juce::AudioProcessorEditor* PhotoSynthAudioProcessor::createEditor()
    {
        return new PhotoSynthAudioProcessorEditor(*this);
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new photosynth::PhotoSynthAudioProcessor();
}

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

#include "SynthVoice.h"

namespace photosynth
{
    SynthVoice::SynthVoice()
    {
        osc1.initialise([](float x){ return std::sin(x); });
        osc2.initialise([](float x){ return x / juce::MathConstants<float>::pi; });
        subOsc.initialise([](float x){ return x < 0.0f ? -1.0f : 1.0f; });
        fmMod.initialise([](float x){ return std::sin(x); });
        lfo.initialise([](float x){ return std::sin(x); });

        shaper.functionToUse = [](float x) { return std::tanh(x); };

        envParams.attack = 0.005f;
        envParams.decay = 0.8f;
        envParams.sustain = 0.7f;
        envParams.release = 0.4f;
    }

    bool SynthVoice::canPlaySound(juce::SynthesiserSound* sound)
    {
        return dynamic_cast<PhotoSynthSound*>(sound) != nullptr;
    }

    void SynthVoice::prepare(double sampleRate, int samplesPerBlock, int outputChannels)
    {
        juce::dsp::ProcessSpec spec{sampleRate, (juce::uint32) samplesPerBlock, (juce::uint32) outputChannels};
        osc1.prepare(spec);
        osc2.prepare(spec);
        subOsc.prepare(spec);
        fmMod.prepare(spec);
        lfo.prepare(spec);
        filter.prepare(spec);
        shaper.prepare(spec);

        filter.setType(juce::dsp::StateVariableTPTFilterType::lowpass);
        filter.setCutoffFrequency(2000.0f);
        filter.setResonance(0.7f);

        cutoffSmoothed.reset(sampleRate, 0.02);
        resonanceSmoothed.reset(sampleRate, 0.02);
        lfoRateSmoothed.reset(sampleRate, 0.02);
        lfoDepthSmoothed.reset(sampleRate, 0.02);

        env.setSampleRate(sampleRate);
        env.setParameters(envParams);
    }

    void SynthVoice::reset()
    {
        env.reset();
        filter.reset();
    }

    void SynthVoice::updatePatch(const PatchParameters& patch, const ImageMetrics& metrics)
    {
        currentPatch = patch;
        currentMetrics = metrics;

        envParams.attack = juce::jlimit(0.001f, 5.0f, patch.attackTime);
        envParams.decay = juce::jlimit(0.01f, 10.0f, patch.decayTime);
        envParams.sustain = juce::jlimit(0.0f, 1.0f, patch.sustainLevel);
        envParams.release = juce::jlimit(0.01f, 8.0f, patch.releaseTime);
        env.setParameters(envParams);

        cutoffSmoothed.setTargetValue(juce::jlimit(20.0f, 20000.0f, patch.cutoffOffset));
        resonanceSmoothed.setTargetValue(juce::jlimit(0.1f, 10.0f, patch.resonance));
        lfoRateSmoothed.setTargetValue(juce::jlimit(0.1f, 20.0f, patch.lfoRate));
        lfoDepthSmoothed.setTargetValue(juce::jlimit(0.0f, 1.0f, patch.lfoDepth));
    }

    void SynthVoice::startNote(int midiNoteNumber, float velocity, juce::SynthesiserSound*, int)
    {
        baseFreq = (float) juce::MidiMessage::getMidiNoteInHertz(midiNoteNumber);

        const float detune = currentPatch.detuneCents;
        level = juce::jlimit(0.0f, 1.0f, velocity);

        const float fmRatio = juce::jlimit(0.5f, 8.0f, currentPatch.fmRatio);
        osc1.setFrequency(baseFreq);
        osc2.setFrequency(baseFreq * std::pow(2.0f, detune / 1200.0f));
        subOsc.setFrequency(baseFreq * 0.5f);
        fmMod.setFrequency(baseFreq * fmRatio);

        releaseTriggered = false;
        env.noteOn();
    }

    void SynthVoice::stopNote(float, bool allowTailOff)
    {
        if (allowTailOff)
        {
            releaseTriggered = true;
            env.noteOff();
        }
        else
        {
            clearCurrentNote();
            env.reset();
            releaseTriggered = false;
        }
    }

    void SynthVoice::pitchWheelMoved(int) {}
    void SynthVoice::controllerMoved(int, int) {}

    float SynthVoice::renderEngineSample(float phaseModSample)
    {
        const auto engine = currentPatch.engineType;

        const float a = osc1.processSample(0.0f);
        const float b = osc2.processSample(0.0f);
        const float s = subOsc.processSample(0.0f) * currentPatch.subOscLevel;

        if (engine == SynthEngineType::acoustic_piano_organ)
            return a * 0.50f + std::sin(std::asin(juce::jlimit(-1.0f, 1.0f, b))) * 0.35f + s * 0.6f + phaseModSample * 0.1f;

        if (engine == SynthEngineType::overdriven_saw_stack || engine == SynthEngineType::analog_brass)
            return shaper.processSample(a * 0.55f + b * 0.55f + s * 0.5f + phaseModSample * 0.2f);

        if (engine == SynthEngineType::fm_square_bell || engine == SynthEngineType::digital_fm_bells)
        {
            const float squareish = (a > 0.0f ? 1.0f : -1.0f) * 0.5f + (b > 0.0f ? 1.0f : -1.0f) * 0.35f;
            return squareish + phaseModSample * 0.65f + s * 0.4f;
        }

        // hybrid_wavetable
        return a * 0.4f + b * 0.4f + s * 0.35f + phaseModSample * 0.25f;
    }

    void SynthVoice::renderNextBlock(juce::AudioBuffer<float>& outputBuffer, int startSample, int numSamples)
    {
        if (!isVoiceActive())
            return;

        for (int sample = 0; sample < numSamples; ++sample)
        {
            const float lfoRate = lfoRateSmoothed.getNextValue();
            const float lfoDepth = lfoDepthSmoothed.getNextValue();
            lfo.setFrequency(lfoRate);

            const float lfoSample = lfo.processSample(0.0f);
            const float filterCutoff = juce::jlimit(20.0f, 20000.0f,
                cutoffSmoothed.getNextValue() + lfoSample * (lfoDepth * 2500.0f));
            filter.setCutoffFrequency(filterCutoff);
            filter.setResonance(resonanceSmoothed.getNextValue());

            const float fm = fmMod.processSample(0.0f) * (baseFreq * juce::jlimit(0.0f, 1.0f, currentPatch.fmAmount) * 5.0f) / 22050.0f;
            const float raw = renderEngineSample(fm);
            const float filtered = filter.processSample(0, raw);

            const float envValue = env.getNextSample();
            const float out = filtered * envValue * level * 0.25f;

            for (int ch = 0; ch < outputBuffer.getNumChannels(); ++ch)
                outputBuffer.addSample(ch, startSample + sample, out);
        }

        if (!env.isActive() && releaseTriggered)
        {
            clearCurrentNote();
            releaseTriggered = false;
        }
    }
}

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

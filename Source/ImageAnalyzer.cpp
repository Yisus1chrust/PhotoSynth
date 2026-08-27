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

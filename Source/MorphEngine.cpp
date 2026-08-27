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

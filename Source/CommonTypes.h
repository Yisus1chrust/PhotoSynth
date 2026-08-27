#pragma once

#include <JuceHeader.h>
#include <array>
#include <vector>

namespace photosynth
{
    enum class SynthEngineType
    {
        analog_brass = 0,
        digital_fm_bells,
        hybrid_wavetable,
        acoustic_piano_organ,
        overdriven_saw_stack,
        fm_square_bell
    };

    enum class EraYear
    {
        era1800s,
        era1960s,
        era1970s,
        era1980s,
        era2000s
    };

    struct TemporalEraInfo
    {
        float eraVal = 0.5f;
        EraYear eraYear = EraYear::era1970s;
        juce::String label = "1970s Discrete Analog";
        juce::String architecture = "Moog Ladder & Fender Rhodes";
        juce::String description = "Warm, fat discrete analog synths, ARP 2600 modular screams & electric pianos";

        struct Weights
        {
            float era1800s = 0.0f;
            float era1960s = 0.0f;
            float era1970s = 1.0f;
            float era1980s = 0.0f;
            float era2000s = 0.0f;
        } weights;
    };

    struct PhysicalModelParameters
    {
        juce::String materialType = "wood";
        std::array<float, 3> bodyResonanceFreqs { 180.0f, 520.0f, 1400.0f };
        float bodyDamping = 0.3f;
        float acousticWeight = 0.25f;
        float tapeFlutterSpeed = 0.8f;
        float tapeFlutterDepth = 0.08f;
        float analogSaturationWarmth = 0.3f;

        struct TransientProfile
        {
            juce::String type = "pluck";
            float hardness = 0.5f;
            float noiseBurst = 0.2f;
        } transientProfile;

        struct SpatialReflection
        {
            float roomSizeSeconds = 1.2f;
            float absorption = 0.35f;
            float diffusion = 0.55f;
            float luminanceDepth = 0.4f;
        } spatialReflection;
    };

    struct EffectConfig
    {
        bool enabled = true;
        float intensity = 0.5f;
        float param1 = 0.5f;
        float param2 = 0.5f;
    };

    struct EffectsState
    {
        EffectConfig delay;
        EffectConfig reverb;
        EffectConfig chorus;
        EffectConfig phaser;
        EffectConfig flanger;
        EffectConfig distortion;
    };

    struct PatchParameters
    {
        float cutoffOffset = 2500.0f;
        float resonance = 1.0f;
        float lfoRate = 2.0f;
        float lfoDepth = 0.2f;

        float masterVolume = -3.0f;
        float attackTime = 0.01f;
        float decayTime = 0.8f;
        float sustainLevel = 0.7f;
        float releaseTime = 0.4f;
        bool limiterEnabled = true;
        float threshold = -3.0f;

        SynthEngineType engineType = SynthEngineType::hybrid_wavetable;
        float detuneCents = 5.0f;
        int unisonVoices = 2;
        float fmRatio = 2.0f;
        float fmAmount = 0.35f;
        float subOscLevel = 0.3f;
        float reverbMix = 0.35f;
        float delayMix = 0.25f;

        EffectsState effects;
        std::vector<float> customLfoProfile;
        PhysicalModelParameters physicalModel;

        float temporalEraVal = 0.5f;
        TemporalEraInfo temporalEra;

        float opticalFocusDepth = 0.5f;
        float gridSymmetryDensity = 0.5f;
        float lightAzimuthAngle = 180.0f;
        float lightElevationAngle = 45.0f;
        float chromaticClash = 0.2f;
        float semanticDensityWeight = 0.5f;
    };

    struct ImageMetrics
    {
        juce::String hash64;
        juce::uint64 seedNumber = 0;
        float brightness = 0.5f;
        float saturation = 0.5f;
        float complexity = 0.5f;
        float timbreDna = 0.5f;
        float dominantHue = 180.0f;
        SynthEngineType archetype = SynthEngineType::hybrid_wavetable;
        TemporalEraInfo temporalEra;

        struct BackgroundFeatures
        {
            float opticalFocusDepth = 0.5f;
            float gridSymmetryDensity = 0.5f;
            float lightAzimuthAngle = 180.0f;
            float lightElevationAngle = 45.0f;
            float chromaticClash = 0.2f;
            float semanticDensityWeight = 0.5f;
            juce::String detectedMaterial = "stone";
        } backgroundFeatures;
    };

    inline float clamp01(float x) { return juce::jlimit(0.0f, 1.0f, x); }

    inline const char* toEngineParamText(SynthEngineType t)
    {
        switch (t)
        {
            case SynthEngineType::analog_brass: return "analog_brass";
            case SynthEngineType::digital_fm_bells: return "digital_fm_bells";
            case SynthEngineType::hybrid_wavetable: return "hybrid_wavetable";
            case SynthEngineType::acoustic_piano_organ: return "acoustic_piano_organ";
            case SynthEngineType::overdriven_saw_stack: return "overdriven_saw_stack";
            case SynthEngineType::fm_square_bell: return "fm_square_bell";
        }
        return "hybrid_wavetable";
    }

    inline SynthEngineType engineFromFloat(float v)
    {
        const int i = juce::jlimit(0, 5, (int) std::round(v));
        return static_cast<SynthEngineType>(i);
    }
}

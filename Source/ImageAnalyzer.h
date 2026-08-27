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

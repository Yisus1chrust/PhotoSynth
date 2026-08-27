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

#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_gui_basics/juce_gui_basics.h>
#include "PluginProcessor.h"

namespace photosynth
{
    class PhotoSynthAudioProcessorEditor : public juce::AudioProcessorEditor
    {
    public:
        PhotoSynthAudioProcessorEditor (PhotoSynthAudioProcessor&);
        ~PhotoSynthAudioProcessorEditor() override;

        void paint (juce::Graphics&) override;
        void resized() override;

    private:
        PhotoSynthAudioProcessor& audioProcessor;

        juce::Slider macro1Slider;
        juce::Slider macro2Slider;

        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhotoSynthAudioProcessorEditor)
    };
}

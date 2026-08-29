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

        // Standard Native JUCE UI Controls
        juce::Slider macro1Slider;
        juce::Slider macro2Slider;

        // Uncomment these later to automatically link your UI to your audio parameters
        // std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> macro1Attachment;
        // std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> macro2Attachment;

        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhotoSynthAudioProcessorEditor)
    };
}

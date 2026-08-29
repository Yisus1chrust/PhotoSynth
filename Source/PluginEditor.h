#pragma once
#include <juce_gui_extra/juce_gui_extra.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"

namespace photosynth
{
    class PhotoSynthAudioProcessorEditor : public juce::AudioProcessorEditor
    {
    public:
        explicit PhotoSynthAudioProcessorEditor (PhotoSynthAudioProcessor&);
        ~PhotoSynthAudioProcessorEditor() override;

        void paint (juce::Graphics&) override;
        void resized() override;

    private:
        PhotoSynthAudioProcessor& audioProcessor;
        juce::WebBrowserComponent webView;

        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhotoSynthAudioProcessorEditor)
    };
}

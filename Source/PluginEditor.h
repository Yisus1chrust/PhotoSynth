#pragma once

#include <juce_gui_extra/juce_gui_extra.h>
#include <juce_audio_processors/juce_audio_processors.h>
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
        PhotoSynthAudioProcessor& processor;
        juce::WebBrowserComponent webView;
        
        // Declared chooser smart pointer for the native FileChooser dialog
        std::unique_ptr<juce::FileChooser> chooser;

        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PhotoSynthAudioProcessorEditor)
    };
}

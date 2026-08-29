#include "PluginEditor.h"

namespace photosynth
{
    PhotoSynthAudioProcessorEditor::PhotoSynthAudioProcessorEditor (PhotoSynthAudioProcessor& p)
        : AudioProcessorEditor (&p), processor (p)
    {
        addAndMakeVisible (webView);
        setSize (1280, 760);
        webView.goToURL ("http://localhost:3000");
    }

    PhotoSynthAudioProcessorEditor::~PhotoSynthAudioProcessorEditor() = default;

    void PhotoSynthAudioProcessorEditor::paint (juce::Graphics& g)
    {
        g.fillAll (juce::Colour (0xff0b1119));
    }

    void PhotoSynthAudioProcessorEditor::resized()
    {
        webView.setBounds (getLocalBounds());
    }
}

#include "PluginEditor.h"

namespace photosynth
{
    PhotoSynthAudioProcessorEditor::PhotoSynthAudioProcessorEditor (PhotoSynthAudioProcessor& p)
        : AudioProcessorEditor (&p), processor (p), webView (juce::WebBrowserComponent::Options().withBackend (juce::WebBrowserComponent::Options::Backend::webview2))
    {
        addAndMakeVisible (webView);
        setSize (1280, 760);

        // Point the webview to your local built index.html or resource
        // For local development bundling, we load the root URL or bundled path
        webView.goToURL ("http://localhost:5173"); // Or your bundled file URL
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

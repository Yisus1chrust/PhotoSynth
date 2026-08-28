#include "PluginEditor.h"

namespace photosynth
{
    PhotoSynthAudioProcessorEditor::PhotoSynthAudioProcessorEditor (PhotoSynthAudioProcessor& p)
        : AudioProcessorEditor (&p), processor (p)
    {
        addAndMakeVisible (webView);
        setSize (1280, 760);

        // Bind native function for React to call file browser securely
        webView.withNativeFunction ("openFileChooser", [this] (const juce::var& message, std::function<void(juce::var)> completion) {
            juce::String targetSlot = message.toString(); // "A" or "B"
            
            chooser = std::make_unique<juce::FileChooser> (
                "Select an image for Slot " + targetSlot,
                juce::File{},
                "*.png;*.jpg;*.jpeg"
            );

            chooser->launchAsync (juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                [this, targetSlot, completion] (const juce::FileChooser& fc) {
                    auto file = fc.getResult();
                    if (file.existsAsFile()) {
                        juce::MemoryBlock mb;
                        if (file.loadFileAsData (mb)) {
                            juce::String base64 = mb.toBase64Encoding();
                            juce::String dataUrl = "data:image/" + file.getFileExtension().substring(1) + ";base64," + base64;
                            
                            // Return data back to React through the native function callback
                            completion (dataUrl);
                            return;
                        }
                    }
                    completion ("");
                });
        });

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

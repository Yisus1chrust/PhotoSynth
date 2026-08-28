#include "PluginEditor.h"

namespace photosynth
{
    PhotoSynthAudioProcessorEditor::PhotoSynthAudioProcessorEditor (PhotoSynthAudioProcessor& p)
        : AudioProcessorEditor (&p), processor (p)
    {
        addAndMakeVisible (webView);
        setSize (1280, 760);

        // Register a callback to handle image upload requests from React for Slot A or B
        webView.registerEventListener ("openFileChooser", [this] (const juce::var& message) {
            juce::String targetSlot = message.toString(); // "A" or "B"
            
            chooser = std::make_unique<juce::FileChooser> (
                "Select an image for Slot " + targetSlot,
                juce::File{},
                "*.png;*.jpg;*.jpeg"
            );

            chooser->launchAsync (juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles,
                [this, targetSlot] (const juce::FileChooser& fc) {
                    auto file = fc.getResult();
                    if (file.existsAsFile()) {
                        juce::MemoryBlock mb;
                        if (file.loadFileAsData (mb)) {
                            juce::String base64 = mb.toBase64Encoding();
                            juce::String dataUrl = "data:image/" + file.getFileExtension().substring(1) + ";base64," + base64;
                            
                            // Send data back to the React UI window object
                            juce::String js = "window.setImageData && window.setImageData('" + targetSlot + "', '" + dataUrl + "');";
                            webView.evaluateJavascript (js);
                        }
                    }
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

#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace photosynth
{
    PhotoSynthAudioProcessorEditor::PhotoSynthAudioProcessorEditor (PhotoSynthAudioProcessor& p)
        : AudioProcessorEditor (&p), audioProcessor (p)
    {
        macro1Slider.setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
        macro1Slider.setTextBoxStyle (juce::Slider::TextBoxBelow, false, 80, 20);
        addAndMakeVisible (macro1Slider);

        macro2Slider.setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
        macro2Slider.setTextBoxStyle (juce::Slider::TextBoxBelow, false, 80, 20);
        addAndMakeVisible (macro2Slider);

        setSize (600, 400); 
    }

    PhotoSynthAudioProcessorEditor::~PhotoSynthAudioProcessorEditor() = default;

    void PhotoSynthAudioProcessorEditor::paint (juce::Graphics& g)
    {
        g.fillAll (juce::Colour (0xff111318)); 

        g.setColour (juce::Colours::white);
        g.setFont (24.0f);
        g.drawFittedText ("Photo Synth", getLocalBounds().removeFromTop (50), juce::Justification::centred, 1);
    }

    void PhotoSynthAudioProcessorEditor::resized()
    {
        auto area = getLocalBounds().reduced (40);
        area.removeFromTop (40); 

        macro1Slider.setBounds (area.removeFromLeft (area.getWidth() / 2));
        macro2Slider.setBounds (area);
    }
}

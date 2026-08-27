#pragma once

#include <JuceHeader.h>
#include "PluginProcessor.h"

namespace photosynth
{
    class RadialGauge : public juce::Component
    {
    public:
        RadialGauge(juce::String title, juce::Colour accent) : label(std::move(title)), color(accent) {}
        void setValue(float v) { value = juce::jlimit(0.0f, 1.0f, v); repaint(); }
        void paint(juce::Graphics& g) override;

    private:
        juce::String label;
        juce::Colour color;
        float value = 0.0f;
    };

    class PhotoSynthAudioProcessorEditor : public juce::AudioProcessorEditor,
                                           public juce::FileDragAndDropTarget,
                                           private juce::Timer
    {
    public:
        explicit PhotoSynthAudioProcessorEditor(PhotoSynthAudioProcessor&);
        ~PhotoSynthAudioProcessorEditor() override = default;

        void paint(juce::Graphics&) override;
        void resized() override;

        bool isInterestedInFileDrag(const juce::StringArray& files) override;
        void filesDropped(const juce::StringArray& files, int x, int y) override;

    private:
        using SliderAttachment = juce::AudioProcessorValueTreeState::SliderAttachment;
        using ButtonAttachment = juce::AudioProcessorValueTreeState::ButtonAttachment;
        using ComboBoxAttachment = juce::AudioProcessorValueTreeState::ComboBoxAttachment;

        PhotoSynthAudioProcessor& processor;

        RadialGauge timbreGauge { "TIMBRE DNA", juce::Colours::cyan };
        RadialGauge brightnessGauge { "BRIGHTNESS", juce::Colours::orange };
        RadialGauge saturationGauge { "SATURATION", juce::Colours::deeppink };
        RadialGauge complexityGauge { "COMPLEXITY", juce::Colours::limegreen };

        juce::TextButton loadImageButton { "Load Image" };
        juce::TextButton savePresetButton { "Save Preset" };
        juce::TextButton loadPresetButton { "Load Preset" };
        juce::Label dropzoneLabel;

        juce::AudioVisualiserComponent oscilloscope { 2 };
        juce::MidiKeyboardComponent keyboard;

        juce::ComboBox engineType;
        juce::ToggleButton limiterButton { "Limiter" };

        juce::Slider cutoff, resonance, lfoRate, lfoDepth;
        juce::Slider volume, attack, decay, sustain, release, threshold;

        std::unique_ptr<SliderAttachment> cutoffAtt, resonanceAtt, lfoRateAtt, lfoDepthAtt;
        std::unique_ptr<SliderAttachment> volumeAtt, attackAtt, decayAtt, sustainAtt, releaseAtt, thresholdAtt;
        std::unique_ptr<ButtonAttachment> limiterAtt;
        std::unique_ptr<ComboBoxAttachment> engineAtt;

        juce::Rectangle<int> dropzone;

        void timerCallback() override;
        void configureKnob(juce::Slider& slider, const juce::String& name);

        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PhotoSynthAudioProcessorEditor)
    };
}

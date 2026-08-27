#include "PluginEditor.h"

namespace photosynth
{
    void RadialGauge::paint(juce::Graphics& g)
    {
        auto r = getLocalBounds().toFloat().reduced(4.0f);
        const auto c = r.getCentre();
        const float radius = juce::jmin(r.getWidth(), r.getHeight()) * 0.5f - 8.0f;

        g.setColour(juce::Colour(0xff151b23));
        g.fillEllipse(c.x - radius, c.y - radius, radius * 2.0f, radius * 2.0f);

        juce::Path p;
        const float start = juce::MathConstants<float>::pi * 0.75f;
        const float end = start + juce::MathConstants<float>::pi * 1.5f * value;
        p.addCentredArc(c.x, c.y, radius, radius, 0.0f, start, end, true);

        g.setColour(juce::Colours::white.withAlpha(0.12f));
        g.drawEllipse(c.x - radius, c.y - radius, radius * 2.0f, radius * 2.0f, 3.0f);

        g.setColour(color);
        g.strokePath(p, juce::PathStrokeType(4.0f));

        g.setColour(juce::Colours::white);
        g.setFont(juce::Font(12.0f, juce::Font::bold));
        g.drawFittedText(juce::String((int) std::round(value * 100.0f)) + "%", getLocalBounds().reduced(8), juce::Justification::centred, 1);

        g.setFont(juce::Font(10.0f));
        g.drawFittedText(label, getLocalBounds().removeFromBottom(14), juce::Justification::centred, 1);
    }

    PhotoSynthAudioProcessorEditor::PhotoSynthAudioProcessorEditor(PhotoSynthAudioProcessor& p)
        : AudioProcessorEditor(&p),
          processor(p),
          keyboard(processor.getKeyboardState(), juce::MidiKeyboardComponent::horizontalKeyboard)
    {
        setSize(1280, 760);

        addAndMakeVisible(timbreGauge);
        addAndMakeVisible(brightnessGauge);
        addAndMakeVisible(saturationGauge);
        addAndMakeVisible(complexityGauge);

        dropzoneLabel.setText("Drop image here or click Load Image", juce::dontSendNotification);
        dropzoneLabel.setJustificationType(juce::Justification::centred);
        dropzoneLabel.setColour(juce::Label::textColourId, juce::Colours::white.withAlpha(0.75f));
        addAndMakeVisible(dropzoneLabel);

        addAndMakeVisible(loadImageButton);
        loadImageButton.onClick = [this]
        {
            auto f = juce::File::getSpecialLocation(juce::File::userDesktopDirectory).getChildFile("photo_synth_input.png");
            if (f.existsAsFile())
                processor.loadImageFile(f);
        };

        addAndMakeVisible(savePresetButton);
        savePresetButton.onClick = [this]
        {
            auto f = juce::File::getSpecialLocation(juce::File::userDocumentsDirectory).getChildFile("PhotoSynthPreset.photosynthpreset");
            processor.savePresetToFile(f);
        };

        addAndMakeVisible(loadPresetButton);
        loadPresetButton.onClick = [this]
        {
            auto f = juce::File::getSpecialLocation(juce::File::userDocumentsDirectory).getChildFile("PhotoSynthPreset.photosynthpreset");
            if (f.existsAsFile())
                processor.loadPresetFromFile(f);
        };

        addAndMakeVisible(oscilloscope);
        oscilloscope.setBufferSize(512);
        oscilloscope.setSamplesPerBlock(32);
        oscilloscope.setColours(juce::Colours::black, juce::Colours::cyan);

        addAndMakeVisible(keyboard);
        keyboard.setAvailableRange(24, 108);

        addAndMakeVisible(engineType);
        engineType.addItemList({ "analog_brass", "digital_fm_bells", "hybrid_wavetable", "acoustic_piano_organ", "overdriven_saw_stack", "fm_square_bell" }, 1);

        configureKnob(cutoff, "Cutoff");
        configureKnob(resonance, "Resonance");
        configureKnob(lfoRate, "LFO Rate");
        configureKnob(lfoDepth, "LFO Depth");
        configureKnob(volume, "Master Volume");
        configureKnob(attack, "Attack");
        configureKnob(decay, "Decay");
        configureKnob(sustain, "Sustain");
        configureKnob(release, "Release");
        configureKnob(threshold, "Threshold");

        addAndMakeVisible(limiterButton);

        auto& apvts = processor.apvts;
        cutoffAtt = std::make_unique<SliderAttachment>(apvts, "cutoffOffset", cutoff);
        resonanceAtt = std::make_unique<SliderAttachment>(apvts, "resonance", resonance);
        lfoRateAtt = std::make_unique<SliderAttachment>(apvts, "lfoRate", lfoRate);
        lfoDepthAtt = std::make_unique<SliderAttachment>(apvts, "lfoDepth", lfoDepth);
        volumeAtt = std::make_unique<SliderAttachment>(apvts, "masterVolume", volume);
        attackAtt = std::make_unique<SliderAttachment>(apvts, "attackTime", attack);
        decayAtt = std::make_unique<SliderAttachment>(apvts, "decayTime", decay);
        sustainAtt = std::make_unique<SliderAttachment>(apvts, "sustainLevel", sustain);
        releaseAtt = std::make_unique<SliderAttachment>(apvts, "releaseTime", release);
        thresholdAtt = std::make_unique<SliderAttachment>(apvts, "threshold", threshold);

        limiterAtt = std::make_unique<ButtonAttachment>(apvts, "limiterEnabled", limiterButton);
        engineAtt = std::make_unique<ComboBoxAttachment>(apvts, "engineType", engineType);

        startTimerHz(30);
    }

    void PhotoSynthAudioProcessorEditor::configureKnob(juce::Slider& slider, const juce::String& name)
    {
        slider.setName(name);
        slider.setSliderStyle(juce::Slider::RotaryHorizontalVerticalDrag);
        slider.setTextBoxStyle(juce::Slider::TextBoxBelow, false, 72, 18);
        slider.setColour(juce::Slider::rotarySliderFillColourId, juce::Colours::cyan.withAlpha(0.8f));
        slider.setColour(juce::Slider::thumbColourId, juce::Colours::white);
        addAndMakeVisible(slider);
    }

    bool PhotoSynthAudioProcessorEditor::isInterestedInFileDrag(const juce::StringArray& files)
    {
        if (files.isEmpty())
            return false;

        const auto ext = juce::File(files[0]).getFileExtension().toLowerCase();
        return ext == ".png" || ext == ".jpg" || ext == ".jpeg" || ext == ".webp" || ext == ".bmp";
    }

    void PhotoSynthAudioProcessorEditor::filesDropped(const juce::StringArray& files, int, int)
    {
        if (!files.isEmpty())
            processor.loadImageFile(juce::File(files[0]));
    }

    void PhotoSynthAudioProcessorEditor::timerCallback()
    {
        const auto& m = processor.getMetrics();
        timbreGauge.setValue(m.timbreDna);
        brightnessGauge.setValue(m.brightness);
        saturationGauge.setValue(m.saturation);
        complexityGauge.setValue(m.complexity);

        juce::AudioBuffer<float> scope;
        processor.getScopeData(scope);
        if (scope.getNumSamples() > 0)
            oscilloscope.pushBuffer(scope);
    }

    void PhotoSynthAudioProcessorEditor::paint(juce::Graphics& g)
    {
        g.fillAll(juce::Colour(0xff0b1119));

        g.setColour(juce::Colours::white);
        g.setFont(juce::Font(26.0f, juce::Font::bold));
        g.drawText("PHOTO SYNTH", 20, 12, 320, 36, juce::Justification::left);

        g.setColour(juce::Colours::cyan.withAlpha(0.4f));
        g.drawFittedText("Image-to-Synth Morphing Instrument", 24, 44, 360, 20, juce::Justification::left, 1);

        g.setColour(juce::Colour(0xff141b26));
        g.fillRoundedRectangle(dropzone.toFloat(), 10.0f);
        g.setColour(juce::Colours::cyan.withAlpha(0.45f));
        g.drawRoundedRectangle(dropzone.toFloat(), 10.0f, 2.0f);

        g.setColour(juce::Colour(0xff11161f));
        g.fillRoundedRectangle(juce::Rectangle<float>(22.0f, 80.0f, 240.0f, 280.0f), 10.0f);

        g.setColour(juce::Colour(0xff11161f));
        g.fillRoundedRectangle(juce::Rectangle<float>((float)getWidth() - 450.0f, 80.0f, 428.0f, 540.0f), 10.0f);
    }

    void PhotoSynthAudioProcessorEditor::resized()
    {
        const int margin = 20;

        auto area = getLocalBounds().reduced(margin);
        auto top = area.removeFromTop(60);
        juce::ignoreUnused(top);

        auto leftPanel = area.removeFromLeft(250);
        auto centerPanel = area.removeFromLeft(520);
        auto rightPanel = area;

        auto gArea = leftPanel.reduced(10);
        timbreGauge.setBounds(gArea.removeFromTop(125));
        brightnessGauge.setBounds(gArea.removeFromTop(125));
        saturationGauge.setBounds(gArea.removeFromTop(125));
        complexityGauge.setBounds(gArea.removeFromTop(125));

        dropzone = centerPanel.removeFromTop(360).reduced(10);
        dropzoneLabel.setBounds(dropzone.reduced(18));

        auto controls = centerPanel.removeFromTop(40).reduced(10, 0);
        loadImageButton.setBounds(controls.removeFromLeft(150));
        savePresetButton.setBounds(controls.removeFromLeft(150).translated(8, 0));
        loadPresetButton.setBounds(controls.removeFromLeft(150).translated(16, 0));

        oscilloscope.setBounds(centerPanel.removeFromTop(160).reduced(10));
        keyboard.setBounds(centerPanel.removeFromTop(80).reduced(10, 8));

        auto rightTop = rightPanel.removeFromTop(36);
        engineType.setBounds(rightTop.removeFromLeft(260));
        limiterButton.setBounds(rightTop.removeFromLeft(120));

        auto grid = rightPanel.reduced(8);
        const int knobW = 100, knobH = 120, gapX = 6;

        auto row1 = grid.removeFromTop(knobH);
        cutoff.setBounds(row1.removeFromLeft(knobW));
        row1.removeFromLeft(gapX);
        resonance.setBounds(row1.removeFromLeft(knobW));
        row1.removeFromLeft(gapX);
        lfoRate.setBounds(row1.removeFromLeft(knobW));
        row1.removeFromLeft(gapX);
        lfoDepth.setBounds(row1.removeFromLeft(knobW));

        auto row2 = grid.removeFromTop(knobH);
        volume.setBounds(row2.removeFromLeft(knobW));
        row2.removeFromLeft(gapX);
        attack.setBounds(row2.removeFromLeft(knobW));
        row2.removeFromLeft(gapX);
        decay.setBounds(row2.removeFromLeft(knobW));
        row2.removeFromLeft(gapX);
        sustain.setBounds(row2.removeFromLeft(knobW));

        auto row3 = grid.removeFromTop(knobH);
        release.setBounds(row3.removeFromLeft(knobW));
        row3.removeFromLeft(gapX);
        threshold.setBounds(row3.removeFromLeft(knobW));
    }
}

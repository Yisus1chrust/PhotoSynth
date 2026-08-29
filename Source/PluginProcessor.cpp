#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace photosynth
{
    // ... your audio processing code (prepareToPlay, processBlock, etc.) ...

    bool PhotoSynthAudioProcessor::hasEditor() const
    {
        return true; // This tells JUCE your plugin has a graphical interface
    }

    juce::AudioProcessorEditor* PhotoSynthAudioProcessor::createEditor()
    {
        return new PhotoSynthAudioProcessorEditor (*this);
    }
}

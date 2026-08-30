#include "PluginProcessor.h"
#include "PluginEditor.h"

namespace photosynth
{
    PhotoSynthAudioProcessor::PhotoSynthAudioProcessor()
#ifndef JucePlugin_PreferredChannelConfigurations
        : AudioProcessor (BusesProperties()
#if ! JucePlugin_IsMidiEffect
#if ! JucePlugin_IsSynth
                           .withInput  ("Input",  juce::AudioChannelSet::stereo(), true)
#endif
                           .withOutput ("Output", juce::AudioChannelSet::stereo(), true)
#endif
                           )
#endif
    {
    }

    PhotoSynthAudioProcessor::~PhotoSynthAudioProcessor() = default;

    const juce::String PhotoSynthAudioProcessor::getName() const
    {
        return JucePlugin_Name;
    }

    bool PhotoSynthAudioProcessor::acceptsMidi() const
    {
   #if JucePlugin_WantsMidiInput
        return true;
   #else
        return false;
   #endif
    }

    bool PhotoSynthAudioProcessor::producesMidi() const
    {
   #if JucePlugin_ProducesMidiOutput
        return true;
   #else
        return false;
   #endif
    }

    bool PhotoSynthAudioProcessor::isMidiEffect() const
    {
   #if JucePlugin_IsMidiEffect
        return true;
   #else
        return false;
   #endif
    }

    double PhotoSynthAudioProcessor::getTailLengthSeconds() const
    {
        return 0.0;
    }

    int PhotoSynthAudioProcessor::getNumPrograms()
    {
        return 1;
    }

    int PhotoSynthAudioProcessor::getCurrentProgram()
    {
        return 0;
    }

    void PhotoSynthAudioProcessor::setCurrentProgram (int index)
    {
        juce::ignoreUnused (index);
    }

    const juce::String PhotoSynthAudioProcessor::getProgramName (int index)
    {
        juce::ignoreUnused (index);
        return {};
    }

    void PhotoSynthAudioProcessor::changeProgramName (int index, const juce::String& newName)
    {
        juce::ignoreUnused (index, newName);
    }

    void PhotoSynthAudioProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
    {
        juce::ignoreUnused (sampleRate, samplesPerBlock);
    }

    void PhotoSynthAudioProcessor::releaseResources()
    {
    }

    void PhotoSynthAudioProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages)
    {
        juce::ScopedNoDenormals noDenormals;
        auto totalNumInputChannels  = getTotalNumInputChannels();
        auto totalNumOutputChannels = getTotalNumOutputChannels();

        for (auto i = totalNumInputChannels; i < totalNumOutputChannels; ++i)
            buffer.clear (i, 0, buffer.getNumSamples());

        juce::ignoreUnused (midiMessages);
    }

    bool PhotoSynthAudioProcessor::hasEditor() const
    {
        return true; 
    }

    juce::AudioProcessorEditor* PhotoSynthAudioProcessor::createEditor()
    {
        return new PhotoSynthAudioProcessorEditor (*this);
    }

    void PhotoSynthAudioProcessor::getStateInformation (juce::MemoryBlock& destData)
    {
        juce::ignoreUnused (destData);
    }

    void PhotoSynthAudioProcessor::setStateInformation (const void* data, int sizeInBytes)
    {
        juce::ignoreUnused (data, sizeInBytes);
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new photosynth::PhotoSynthAudioProcessor();
}

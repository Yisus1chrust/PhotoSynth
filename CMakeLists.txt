cmake_minimum_required(VERSION 3.22)

project(PhotoSynth VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Disable unwanted JUCE modules/extras globally to prevent macOS SDK compilation errors
set(JUCE_BUILD_EXTRAS OFF CACHE BOOL "" FORCE)
set(JUCE_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(JUCE_TOOL_SUPPORT OFF CACHE BOOL "" FORCE)

# JUCE 8.x - provide JUCE via:
# 1) -DJUCE_DIR=/path/to/JUCE or
# 2) git submodule in ./JUCE or
# 3) auto-fetch from GitHub (PHOTO_SYNTH_FETCH_JUCE=ON)
option(PHOTO_SYNTH_FETCH_JUCE "Fetch JUCE automatically if not provided" ON)

if (EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/JUCE/CMakeLists.txt")
    add_subdirectory(JUCE)
elseif(DEFINED JUCE_DIR AND EXISTS "${JUCE_DIR}/CMakeLists.txt")
    add_subdirectory(${JUCE_DIR} JUCE)
elseif(PHOTO_SYNTH_FETCH_JUCE)
    include(FetchContent)
    FetchContent_Declare(
        JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG 8.0.6
    )
    FetchContent_MakeAvailable(JUCE)
else()
    message(FATAL_ERROR "JUCE not found. Add JUCE as submodule at ./JUCE or pass -DJUCE_DIR=/path/to/JUCE")
endif()

juce_add_plugin(PhotoSynth
    COMPANY_NAME "ModularSoundTechnologies"
    BUNDLE_ID com.modularsoundtechnologies.photosynth
    IS_SYNTH TRUE
    NEEDS_MIDI_INPUT TRUE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS TRUE
    PLUGIN_MANUFACTURER_CODE Mstl
    PLUGIN_CODE PhSy
    FORMATS VST3 AU Standalone
    PRODUCT_NAME "Photo Synth"
)

target_sources(PhotoSynth PRIVATE
    Source/CommonTypes.h
    Source/ImageAnalyzer.h
    Source/ImageAnalyzer.cpp
    Source/MorphEngine.h
    Source/MorphEngine.cpp
    Source/PhysicalModeling.h
    Source/PhysicalModeling.cpp
    Source/EffectsChain.h
    Source/EffectsChain.cpp
    Source/SynthVoice.h
    Source/SynthVoice.cpp
    Source/SynthEngine.h
    Source/SynthEngine.cpp
    Source/PluginProcessor.h
    Source/PluginProcessor.cpp
    Source/PluginEditor.h
    Source/PluginEditor.cpp
)

target_include_directories(PhotoSynth PRIVATE Source)

target_compile_definitions(PhotoSynth
    PUBLIC
        JUCE_WEB_BROWSER=1
        JUCE_USE_CURL=0
        JUCE_VST3_CAN_REPLACE_VST2=0
)

# Suppress deprecation errors on macOS compilers
if(APPLE)
    target_compile_options(PhotoSynth PRIVATE "-Wno-error=deprecated-declarations")
endif()

target_link_libraries(PhotoSynth
    PRIVATE
        juce::juce_audio_utils
        juce::juce_audio_processors
        juce::juce_dsp
        juce::juce_gui_extra
    PUBLIC
        juce::juce_recommended_config_flags
        juce::juce_recommended_lto_flags
        juce::juce_recommended_warning_flags
)

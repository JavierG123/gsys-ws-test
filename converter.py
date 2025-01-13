import struct
import sys

def convert_raw_to_wav(input_path, output_path):

    # WAV file properties
    num_channels = 1  # Mono
    sample_rate = 8000  # Hz
    bits_per_sample = 8  # u-Law uses 8 bits per sample
    audio_format = 7  # 7 = u-Law in WAV specification

    # Read raw data
    with open(input_path, 'rb') as raw_file:
        raw_data = raw_file.read()

    # Calculate sizes
    byte_rate = sample_rate * num_channels * (bits_per_sample // 8)
    block_align = num_channels * (bits_per_sample // 8)
    data_size = len(raw_data)
    chunk_size = 36 + data_size

    # Create WAV header
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',  # ChunkID
        chunk_size,  # ChunkSize
        b'WAVE',  # Format
        b'fmt ',  # Subchunk1ID
        16,  # Subchunk1Size (16 for PCM/u-Law)
        audio_format,  # AudioFormat (7 for u-Law)
        num_channels,  # NumChannels
        sample_rate,  # SampleRate
        byte_rate,  # ByteRate
        block_align,  # BlockAlign
        bits_per_sample,  # BitsPerSample
        b'data',  # Subchunk2ID
        data_size,  # Subchunk2Size
    )

    # Write header + raw data to output WAV file
    with open(output_path, 'wb') as wav_file:
        wav_file.write(header)
        wav_file.write(raw_data)

    print(f"Converted to WAV: {output_path}")
    
if sys.argv[2] == "":
   print("hola")
   sys.stdout.flush()
else:
    # Example usage
    raw_file = sys.argv[1]  # Path to the raw file
    wav_file = sys.argv[2]  # Path to save the WAV file
    convert_raw_to_wav(raw_file, wav_file)
    sys.stdout.flush()
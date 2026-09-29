import sys
import json
import subprocess
import os

def get_audio_duration(file_path):
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=nokey=1:noprint_wrappers=1",
        file_path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(res.stdout.strip())

def detect_silences(file_path, noise_db="-30dB", min_duration=0.4):
    cmd = [
        "ffmpeg", "-i", file_path,
        "-af", f"silencedetect=noise={noise_db}:d={min_duration}",
        "-f", "null", "-"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    silences = []
    current_start = None
    
    for line in res.stderr.splitlines():
        if "silence_start:" in line:
            parts = line.split("silence_start:")
            try:
                current_start = float(parts[1].strip().split()[0])
            except Exception:
                pass
        elif "silence_end:" in line and current_start is not None:
            parts = line.split("silence_end:")
            try:
                end_val = float(parts[1].strip().split()[0])
                silences.append((current_start, end_val))
                current_start = None
            except Exception:
                pass
    return silences

def transcribe(file_path):
    from transformers import pipeline
    import warnings
    warnings.filterwarnings("ignore")

    duration = get_audio_duration(file_path)
    silences = detect_silences(file_path)

    transcriber = pipeline(
        "automatic-speech-recognition",
        model="openai/whisper-tiny",
        return_timestamps="word"
    )

    result = transcriber(file_path)
    raw_chunks = result.get("chunks", [])

    words = []
    for chunk in raw_chunks:
        ts = chunk.get("timestamp")
        if ts and ts[0] is not None and ts[1] is not None:
            w_text = chunk.get("text", "").strip()
            if w_text:
                words.append({
                    "text": w_text,
                    "start": round(float(ts[0]), 3),
                    "end": round(float(ts[1]), 3)
                })

    # Group words into spoken segments
    segments = []
    if words:
        curr_segment_words = []
        seg_start = words[0]["start"]
        
        for i, word in enumerate(words):
            curr_segment_words.append(word["text"])
            is_last = (i == len(words) - 1)
            time_gap = (words[i+1]["start"] - word["end"]) if not is_last else 0
            
            # End segment on sentence punctuation or significant pause (> 0.8s) or 8 words
            if is_last or time_gap > 0.8 or word["text"].endswith((".", "!", "?")) or len(curr_segment_words) >= 8:
                seg_end = word["end"]
                segments.append({
                    "start": round(seg_start, 2),
                    "end": round(seg_end, 2),
                    "text": " ".join(curr_segment_words),
                    "speaker": "Speaker"
                })
                curr_segment_words = []
                if not is_last:
                    seg_start = words[i+1]["start"]
    elif result.get("text", "").strip():
        # Fallback if words timestamps unavailable
        text = result.get("text", "").strip()
        segments.append({
            "start": 0.0,
            "end": round(duration, 2),
            "text": text,
            "speaker": "Speaker"
        })

    # Integrate detected silence intervals as explicit silence segments
    for sil_start, sil_end in silences:
        # Check if overlap with existing spoken words
        # Only add if silence is meaningful (> 0.4s)
        if sil_end - sil_start >= 0.4:
            segments.append({
                "start": round(sil_start, 2),
                "end": round(min(sil_end, duration), 2),
                "text": "[silence]",
                "isSilence": True
            })

    # Sort segments chronologically
    segments.sort(key=lambda s: s["start"])

    # If no segments at all, output whole duration
    if not segments:
        segments.append({
            "start": 0.0,
            "end": round(duration, 2),
            "text": "[audio]",
            "speaker": "Speaker"
        })

    return {
        "duration": round(duration, 2),
        "segments": segments,
        "words": words,
        "source": "whisper"
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)
        
    target_file = sys.argv[1]
    try:
        output = transcribe(target_file)
        print(json.dumps(output))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)

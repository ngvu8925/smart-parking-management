#pragma once
#include <Arduino.h>

/**
 * ============================================================================
 * Smart Water Guardian - Signal Conditioning & Noise Filtering
 * ============================================================================
 * 
 * Bộ xử lý lọc tín hiệu chống nhiễu cảm biến nước:
 * 1. MedianFilter: Loại bỏ triệt để xung nhiễu đột ngột (do bọt khí trôi qua flow cell)
 * 2. MovingAverageFilter: Làm mịn nhiễu nhiệt ADC của ESP32
 * 3. ExponentialFilter (EMA): Bộ lọc làm mịn tiết kiệm RAM
 */

// Bộ lọc trung vị (Median Filter) chuyên trị bọt khí quang học
template <size_t WINDOW_SIZE = 5>
class MedianFilter {
private:
  float buffer[WINDOW_SIZE];
  size_t index = 0;
  size_t count = 0;

public:
  MedianFilter() {
    reset();
  }

  void reset() {
    index = 0;
    count = 0;
    for (size_t i = 0; i < WINDOW_SIZE; i++) buffer[i] = 0.0f;
  }

  float filter(float sample) {
    buffer[index] = sample;
    index = (index + 1) % WINDOW_SIZE;
    if (count < WINDOW_SIZE) count++;

    // Copy sang mảng tạm để sắp xếp
    float sorted[WINDOW_SIZE];
    for (size_t i = 0; i < count; i++) sorted[i] = buffer[i];

    // Insertion sort đơn giản cho cửa sổ nhỏ
    for (size_t i = 1; i < count; i++) {
      float key = sorted[i];
      int j = i - 1;
      while (j >= 0 && sorted[j] > key) {
        sorted[j + 1] = sorted[j];
        j--;
      }
      sorted[j + 1] = key;
    }

    return sorted[count / 2];
  }
};

// Bộ lọc trung bình trượt (Moving Average Filter)
template <size_t WINDOW_SIZE = 8>
class MovingAverageFilter {
private:
  float buffer[WINDOW_SIZE];
  float sum = 0.0f;
  size_t index = 0;
  size_t count = 0;

public:
  MovingAverageFilter() {
    reset();
  }

  void reset() {
    sum = 0.0f;
    index = 0;
    count = 0;
    for (size_t i = 0; i < WINDOW_SIZE; i++) buffer[i] = 0.0f;
  }

  float filter(float sample) {
    if (count >= WINDOW_SIZE) {
      sum -= buffer[index];
    } else {
      count++;
    }
    buffer[index] = sample;
    sum += sample;
    index = (index + 1) % WINDOW_SIZE;

    return sum / (float)count;
  }
};

// Bộ lọc làm mịn hàm mũ (EMA - Exponential Moving Average)
class ExponentialFilter {
private:
  float alpha;
  float filteredValue = 0.0f;
  bool initialized = false;

public:
  explicit ExponentialFilter(float alphaCoeff = 0.2f) : alpha(alphaCoeff) {}

  void setAlpha(float a) { alpha = constrain(a, 0.01f, 1.0f); }

  float filter(float sample) {
    if (!initialized) {
      filteredValue = sample;
      initialized = true;
      return filteredValue;
    }
    filteredValue = (alpha * sample) + ((1.0f - alpha) * filteredValue);
    return filteredValue;
  }

  void reset() { initialized = false; }
};

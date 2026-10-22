#include <stdint.h>
double sum_u8(const uint8_t *p, int n) { double s = 0; for (int i = 0; i < n; i++) s += p[i]; return s; }
double sum_u8_long(const uint8_t *p, long n) { double s = 0; for (long i = 0; i < n; i++) s += p[i]; return s; }
double dot_i16_long(const int16_t *a, const int16_t *b, long n) { double s = 0; for (long i = 0; i < n; i++) s += (double)a[i] * b[i]; return s; }
float dot_i8_f32_1024(const int8_t *a, const int8_t *b) { float s = 0; for (int i = 0; i < 1024; i++) s += (float)a[i] * (float)b[i]; return s; }
float dot_i8_f32_2048(const int8_t *a, const int8_t *b) { float s = 0; for (int i = 0; i < 2048; i++) s += (float)a[i] * (float)b[i]; return s; }
double dot_real(const double *a, const double *b, int n) { double s = 0; for (int i = 0; i < n; i++) s += a[i] * b[i]; return s; }
double sum2d_u8(const uint8_t *img, int h, int w) { double s = 0; for (int r = 0; r < h; r++) for (int c = 0; c < w; c++) s += img[(long)r * w + c]; return s; }
double cond_sum(const int8_t *p, int n) { double s = 0; for (int i = 0; i < n; i++) if (p[i] > 0) s += p[i]; return s; }

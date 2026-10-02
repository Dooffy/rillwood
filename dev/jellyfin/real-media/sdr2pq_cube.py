# SPDX-License-Identifier: GPL-3.0-or-later
# Writes a 3D LUT (.cube) mapping BT.709 SDR (BT.1886 gamma 2.4) R'G'B' to BT.2020 PQ R'G'B'.
# SDR reference white -> 203 nits (ITU-R BT.2408). Usage: python3 sdr2pq_cube.py out.cube
import sys
N = 33
M = [[0.6274, 0.3293, 0.0433], [0.0691, 0.9195, 0.0114], [0.0164, 0.0880, 0.8956]]  # 709 -> 2020
m1, m2, c1, c2, c3 = 0.1593017578125, 78.84375, 0.8359375, 18.8515625, 18.6875
def pq(n):  # n = nits
    y = max(n, 0) / 10000.0
    return ((c1 + c2 * y ** m1) / (1 + c3 * y ** m1)) ** m2
with open(sys.argv[1], "w") as f:
    f.write("TITLE \"SDR709 to PQ2020 203nit\"\nLUT_3D_SIZE %d\n" % N)
    for b in range(N):
        for g in range(N):
            for r in range(N):
                lin = [(v / (N - 1)) ** 2.4 for v in (r, g, b)]
                out = [sum(M[i][j] * lin[j] for j in range(3)) for i in range(3)]
                f.write("%.6f %.6f %.6f\n" % tuple(pq(203 * v) for v in out))

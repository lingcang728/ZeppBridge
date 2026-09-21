"""Regression checks for transparent catalog inputs touching the canvas edge."""

import importlib.util
import sys
import unittest
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location(
    "catalog_builder",
    Path(__file__).resolve().parents[1] / "scripts/assets/build-device-catalog.py",
)
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.Image = Image
builder.ImageOps = ImageOps
builder.cv2 = cv2
builder.np = np


class TransparentPaddingTests(unittest.TestCase):
    def test_edge_touching_product_gets_real_padding_without_pixel_changes(self):
        source = Image.new("RGBA", (50, 20), (24, 40, 60, 255))
        result = builder.trim_alpha(source, padding=18)
        self.assertEqual(result.size, (86, 56))
        self.assertEqual(result.getchannel("A").getbbox(), (18, 18, 68, 38))
        self.assertEqual(result.crop((18, 18, 68, 38)).tobytes(), source.tobytes())

    def test_transparent_input_bypasses_background_segmentation(self):
        source = Image.new("RGBA", (50, 20), (255, 255, 255, 0))
        source.paste((235, 235, 235, 128), (0, 0, 30, 15))
        result = builder.normalize_asset(source, preserve_alpha=True)
        self.assertEqual(result.getchannel("A").getbbox(), (18, 18, 48, 33))
        self.assertEqual(result.getpixel((18, 18)), (235, 235, 235, 128))
        self.assertEqual(result.getpixel((0, 0)), (0, 0, 0, 0))


if __name__ == "__main__":
    unittest.main()

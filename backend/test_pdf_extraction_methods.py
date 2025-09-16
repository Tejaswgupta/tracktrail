
import unittest
from utils.digital_pdf_extraction import PDFExtractor

class TestPDFExtractorInit(unittest.TestCase):
    def test_init_with_camelot(self):
        extractor = PDFExtractor(method="camelot")
        self.assertEqual(extractor.extraction_methods, ["camelot"])
    
    def test_init_with_pymupdf(self):
        extractor = PDFExtractor(method="pymupdf")
        self.assertEqual(extractor.extraction_methods, ["pymupdf"])
    
    def test_init_with_both(self):
        extractor = PDFExtractor(method="both")
        self.assertEqual(extractor.extraction_methods, ["camelot", "pymupdf"])
    
    def test_init_with_invalid_method(self):
        extractor = PDFExtractor(method="invalid")
        self.assertEqual(extractor.extraction_methods, ["camelot", "pymupdf"])
    
    def test_init_with_default(self):
        extractor = PDFExtractor()
        self.assertEqual(extractor.extraction_methods, ["camelot", "pymupdf"])

if __name__ == "__main__":
    unittest.main()
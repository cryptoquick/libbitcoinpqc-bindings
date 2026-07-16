from setuptools import setup, find_packages
import os

# Get the absolute path to the directory containing setup.py
here = os.path.abspath(os.path.dirname(__file__))

# Prefer python/README.md; fall back to repo root README
readme_path = os.path.join(here, "README.md")
if not os.path.exists(readme_path):
    readme_path = os.path.join(here, "..", "README.md")
with open(readme_path, encoding="utf-8") as f:
    long_description = f.read()

setup(
    name="bitcoinpqc",
    version="0.4.1",
    packages=find_packages(),
    description="Python bindings for libbitcoinpqc",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Bitcoin PQC Developers",
    url="https://github.com/jbride/libbitcoinpqc-bindings",
    license="MIT",
    license_files=["LICENSE"],
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.7",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.7",
)

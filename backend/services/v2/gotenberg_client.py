import requests
import tempfile
import logging
from pathlib import Path
from typing import Optional
import os

logger = logging.getLogger(__name__)

# Health-check timeout (seconds). Generous enough to absorb Railway cold-start
# latency spikes — a single slow check should not mark the service unavailable.
HEALTH_CHECK_TIMEOUT = 10
HEALTH_CHECK_RETRIES = 2

# Production Gotenberg service URL used as a last-resort default.
# NOTE: Railway's railway.toml does NOT support an [env] table, so GOTENBERG_URL
# declared there is ignored. Set GOTENBERG_URL in the Railway dashboard for the
# canonical configuration; this default keeps exports working if it is missing.
DEFAULT_PRODUCTION_GOTENBERG_URL = "https://gotenberg-production-c928.up.railway.app"
DEFAULT_LOCAL_GOTENBERG_URL = "http://localhost:3000"


def _resolve_default_url() -> str:
    """Pick a sensible default Gotenberg URL based on the runtime environment."""
    is_production = (
        os.getenv('RAILWAY_ENVIRONMENT') == 'production'
        or os.getenv('ENVIRONMENT') == 'production'
        or bool(os.getenv('RAILWAY_PROJECT_ID'))
    )
    return DEFAULT_PRODUCTION_GOTENBERG_URL if is_production else DEFAULT_LOCAL_GOTENBERG_URL


class GotenbergClient:
    """Client for interacting with Gotenberg service for HTML to PDF conversion"""

    def __init__(self, gotenberg_url: str = None):
        # Prefer an explicit URL, then the GOTENBERG_URL env var (set this in the
        # Railway dashboard — railway.toml's [env] block is ignored by Railway),
        # then an environment-appropriate default.
        raw_url = (
            gotenberg_url
            or os.getenv('GOTENBERG_URL')
            or _resolve_default_url()
        )
        # Normalize: a GOTENBERG_URL set without a scheme (e.g.
        # "gotenberg-production-c928.up.railway.app") makes requests raise
        # MissingSchema. Default a bare host to https:// so a common
        # dashboard misconfiguration cannot break PDF/image generation.
        url = raw_url.strip().rstrip('/')
        if url and not url.startswith(('http://', 'https://')):
            url = f"https://{url}"
        self.gotenberg_url = url
        # Whether GOTENBERG_URL came from the environment (vs. a code default).
        self.url_from_env = bool(gotenberg_url or os.getenv('GOTENBERG_URL'))
        self.last_error: Optional[str] = None
        self.available = False
        self._check_availability()

    def _check_availability(self):
        """Check if Gotenberg service is available.

        Tries the /health endpoint a few times to tolerate cold-start latency.
        Logs the URL and any failure so the cause is visible in Railway logs.
        """
        last_error = None
        for attempt in range(1, HEALTH_CHECK_RETRIES + 1):
            try:
                response = requests.get(
                    f"{self.gotenberg_url}/health",
                    timeout=HEALTH_CHECK_TIMEOUT,
                )
                self.available = response.status_code == 200
                if self.available:
                    self.last_error = None
                    return
                last_error = f"HTTP {response.status_code}"
            except Exception as e:
                last_error = f"{type(e).__name__}: {e}"

        self.available = False
        self.last_error = last_error
        logger.warning(
            "Gotenberg health check failed at %s/health after %d attempt(s): %s",
            self.gotenberg_url,
            HEALTH_CHECK_RETRIES,
            last_error,
        )

    def diagnostics(self) -> dict:
        """Return connection diagnostics for troubleshooting (no secrets)."""
        return {
            "gotenberg_url": self.gotenberg_url,
            "url_from_env": self.url_from_env,
            "available": self.available,
            "last_error": self.last_error,
        }
    
    def html_to_pdf(self, html_content: str, filename: str = "document.pdf") -> Optional[Path]:
        """
        Convert HTML content to PDF using Gotenberg
        
        Args:
            html_content: The HTML content to convert
            filename: Name for the output PDF file
            
        Returns:
            Path to the generated PDF file, or None if conversion failed
        """
        if not self.available:
            raise Exception("Gotenberg service is not available")
        
        try:
            # Create temporary HTML file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False, encoding='utf-8') as temp_html:
                temp_html.write(html_content)
                temp_html_path = temp_html.name
            
            # Prepare files for Gotenberg
            files = {
                'files': ('index.html', open(temp_html_path, 'rb'), 'text/html')
            }
            
            # PDF conversion options for A5 paper
            data = {
                'paperWidth': '5.83',
                'paperHeight': '8.27',
                'marginTop': '0.4',
                'marginBottom': '0.4',
                'marginLeft': '0.3',
                'marginRight': '0.3',
                'printBackground': 'true',
                'preferCSSPageSize': 'true'
            }
            
            # Make request to Gotenberg
            response = requests.post(
                f"{self.gotenberg_url}/forms/chromium/convert/html",
                files=files,
                data=data,
                timeout=30
            )

            # Clean up: close file handle FIRST (required on Windows), then delete
            files['files'][1].close()
            os.unlink(temp_html_path)
            
            if response.status_code == 200:
                # Save PDF to temporary file
                output_dir = Path("backend/uploads")
                output_dir.mkdir(exist_ok=True)
                
                pdf_path = output_dir / filename
                with open(pdf_path, 'wb') as pdf_file:
                    pdf_file.write(response.content)
                
                return pdf_path
            else:
                raise Exception(f"Gotenberg conversion failed: {response.status_code} - {response.text}")
                
        except Exception as e:
            # Clean up: close file handle FIRST (required on Windows), then delete
            try:
                if 'files' in locals() and files['files'][1]:
                    files['files'][1].close()
                if 'temp_html_path' in locals():
                    os.unlink(temp_html_path)
            except:
                pass
            raise Exception(f"Error converting HTML to PDF: {str(e)}")
    
    def is_available(self) -> bool:
        """Check if Gotenberg service is currently available"""
        self._check_availability()
        return self.available

    def html_to_image(
        self,
        html_content: str,
        filename: str = "image.png",
        width: int = 1080,
        height: int = 1920,
        format: str = "png"
    ) -> Optional[Path]:
        """
        Convert HTML content to image using Gotenberg screenshot endpoint.

        Args:
            html_content: The HTML content to convert
            filename: Name for the output image file
            width: Image width in pixels (default 1080)
            height: Image height in pixels (default 1920)
            format: Image format - 'png' or 'jpeg' (default 'png')

        Returns:
            Path to the generated image file, or None if conversion failed
        """
        if not self.available:
            raise Exception("Gotenberg service is not available")

        try:
            # Create temporary HTML file
            with tempfile.NamedTemporaryFile(mode='w', suffix='.html', delete=False, encoding='utf-8') as temp_html:
                temp_html.write(html_content)
                temp_html_path = temp_html.name

            # Prepare files for Gotenberg
            files = {
                'files': ('index.html', open(temp_html_path, 'rb'), 'text/html')
            }

            # Screenshot conversion options with explicit clip region
            # NOTE: skipNetworkIdleEvent must be 'false' to fix tiling bug (Gotenberg #1065)
            # This was broken in Gotenberg 8.11+ when the default changed from false to true
            data = {
                'width': str(width),
                'height': str(height),
                'clipX': '0',
                'clipY': '0',
                'clipWidth': str(width),
                'clipHeight': str(height),
                'captureBeyondViewport': 'false',
                'deviceScaleFactor': '1',
                'omitBackground': 'false',
                'format': format,
                'quality': '90',  # JPEG quality (ignored for PNG)
                'optimizeForSpeed': 'false',
                'skipNetworkIdleEvent': 'false'  # Critical: fixes screenshot tiling bug #1065
            }

            # Make request to Gotenberg screenshot endpoint
            response = requests.post(
                f"{self.gotenberg_url}/forms/chromium/screenshot/html",
                files=files,
                data=data,
                timeout=30
            )

            # Clean up: close file handle FIRST (required on Windows), then delete
            files['files'][1].close()
            os.unlink(temp_html_path)

            if response.status_code == 200:
                # Save image to uploads directory
                output_dir = Path("backend/uploads")
                output_dir.mkdir(exist_ok=True)

                image_path = output_dir / filename
                with open(image_path, 'wb') as image_file:
                    image_file.write(response.content)

                return image_path
            else:
                raise Exception(f"Gotenberg screenshot failed: {response.status_code} - {response.text}")

        except Exception as e:
            # Clean up: close file handle FIRST (required on Windows), then delete
            try:
                if 'files' in locals() and files['files'][1]:
                    files['files'][1].close()
                if 'temp_html_path' in locals():
                    os.unlink(temp_html_path)
            except:
                pass
            raise Exception(f"Error converting HTML to image: {str(e)}")

#!/usr/bin/env python3
"""
Quick test script to verify Gmail SMTP credentials
Usage: python3 test-email.py
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import sys

# Email configuration
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SENDER_EMAIL = input("Enter your Gmail address: ")
APP_PASSWORD = input("Enter your Gmail App Password (16 chars): ")
RECEIVER_EMAIL = input("Enter test recipient email (can be same): ")

def test_smtp_connection():
    """Test SMTP connection and authentication"""
    try:
        print(f"\n1. Connecting to {SMTP_HOST}:{SMTP_PORT}...")
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)

        print("2. Starting TLS encryption...")
        server.starttls()

        print("3. Attempting login...")
        server.login(SENDER_EMAIL, APP_PASSWORD)

        print("✅ Login successful!")

        print("\n4. Sending test email...")
        message = MIMEMultipart("alternative")
        message["Subject"] = "Trip Calculate - Email Test"
        message["From"] = SENDER_EMAIL
        message["To"] = RECEIVER_EMAIL

        text = "This is a test email from Trip Calculate app. Email configuration is working!"
        html = f"""
        <html>
          <body>
            <h2>✅ Email Configuration Test</h2>
            <p>This is a test email from Trip Calculate app.</p>
            <p>Email configuration is working correctly!</p>
            <hr>
            <p><small>Sent from: {SENDER_EMAIL}</small></p>
          </body>
        </html>
        """

        part1 = MIMEText(text, "plain")
        part2 = MIMEText(html, "html")
        message.attach(part1)
        message.attach(part2)

        server.sendmail(SENDER_EMAIL, RECEIVER_EMAIL, message.as_string())

        print(f"✅ Test email sent successfully to {RECEIVER_EMAIL}")
        print("\nCheck your inbox to confirm delivery.")

        server.quit()
        return True

    except smtplib.SMTPAuthenticationError as e:
        print(f"\n❌ Authentication failed!")
        print(f"Error: {e}")
        print("\nPossible issues:")
        print("1. Incorrect email or app password")
        print("2. App password not generated (need to enable 2FA first)")
        print("3. App password was revoked")
        print("\nGenerate new app password at: https://myaccount.google.com/apppasswords")
        return False

    except Exception as e:
        print(f"\n❌ Connection failed!")
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("Trip Calculate - Gmail SMTP Test")
    print("=" * 60)

    success = test_smtp_connection()

    print("\n" + "=" * 60)
    if success:
        print("✅ Email credentials are valid!")
        print("\nYou can now use these credentials in your deployment:")
        print(f"  GMAIL_USERNAME={SENDER_EMAIL}")
        print(f"  GMAIL_APP_PASSWORD={APP_PASSWORD[:4]}...{APP_PASSWORD[-4:]}")
    else:
        print("❌ Email test failed. Fix the issues above and try again.")
    print("=" * 60)

    sys.exit(0 if success else 1)

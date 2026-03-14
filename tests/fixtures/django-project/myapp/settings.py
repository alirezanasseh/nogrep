SECRET_KEY = "test-secret-key"
DEBUG = True
INSTALLED_APPS = ["django.contrib.auth", "users", "payments"]
DATABASES = {"default": {"ENGINE": "django.db.backends.postgresql", "NAME": "mydb"}}
ROOT_URLCONF = "myapp.urls"

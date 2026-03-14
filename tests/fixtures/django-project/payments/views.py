from django.http import JsonResponse

def payment_create(request):
    return JsonResponse({"status": "ok"})

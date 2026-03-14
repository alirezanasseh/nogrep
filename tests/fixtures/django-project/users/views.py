from django.http import JsonResponse

def user_list(request):
    return JsonResponse({"users": []})

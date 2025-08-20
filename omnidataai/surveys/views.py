from django.shortcuts import render
from django.http import JsonResponse
from .models import Survey
def home(request):
    return render(request, "surveys/index.html")
def api_surveys(request):
    data = list(Survey.objects.values("id","title","description"))
    return JsonResponse(data, safe=False)

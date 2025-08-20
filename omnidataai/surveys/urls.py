from django.urls import path
from . import views
urlpatterns = [
    path('', views.home, name="home"),
    path('api/surveys/', views.api_surveys, name="api_surveys"),
]

from django.contrib import admin
from .models import Survey, Question, Response

class QuestionInline(admin.TabularInline):
    model = Question
    extra = 1  # allows adding new questions directly when editing a survey

@admin.register(Survey)
class SurveyAdmin(admin.ModelAdmin):
    list_display = ("title", "description")
    inlines = [QuestionInline]   # shows related questions inside survey admin


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("question_text", "survey", "type")
    list_filter = ("type", "survey")


@admin.register(Response)
class ResponseAdmin(admin.ModelAdmin):
    list_display = ("user", "survey", "submitted_at")
    list_filter = ("survey", "submitted_at")

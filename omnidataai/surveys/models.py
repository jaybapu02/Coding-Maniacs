from django.db import models
from django.contrib.auth.models import User

class Survey(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.title


class Question(models.Model):
    QUESTION_TYPES = [
        ('MCQ', 'Multiple Choice'),
        ('TEXT', 'Text'),
        ('RATING', 'Rating'),
    ]

    survey = models.ForeignKey(Survey, on_delete=models.CASCADE, related_name="questions")
    question_text = models.CharField(max_length=500)
    type = models.CharField(max_length=10, choices=QUESTION_TYPES, default='TEXT')

    def __str__(self):
        return f"{self.question_text} ({self.type})"


class Response(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    survey = models.ForeignKey(Survey, on_delete=models.CASCADE, related_name="responses")
    answers = models.JSONField()
    submitted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Response by {self.user.username} to {self.survey.title}"

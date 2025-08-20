from django.db import models
from django.contrib.auth.models import User
class Survey(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    def __str__(self): return self.title
class Question(models.Model):
    QUESTION_TYPES = [('MCQ','Multiple Choice'),('TEXT','Text'),('RATING','Rating')]
    survey = models.ForeignKey(Survey, related_name="questions", on_delete=models.CASCADE)
    text = models.CharField(max_length=500)
    q_type = models.CharField(max_length=10, choices=QUESTION_TYPES)
    options = models.JSONField(blank=True, null=True)
    def __str__(self): return f"Q{self.id}: {self.text[:40]}"
class Response(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="responses")
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    answer = models.TextField()
    submitted_at = models.DateTimeField(auto_now_add=True)
    def __str__(self): return f"Resp {self.id} -> Q{self.question_id}"

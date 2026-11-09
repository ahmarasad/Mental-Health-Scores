import joblib
from fastapi import FastAPI
from pydantic import BaseModel, Field
import pandas as  pd
from typing import Literal
from fastapi.middleware.cors import CORSMiddleware
model = joblib.load("Mental_Health_Model.pkl")

top_countries = ['Other','India','USA','Canada','Australia','UK','Germany','Mexico','Turkey','France']

from fastapi import FastAPI

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class StudentData(BaseModel):
    age                    : int = Field(..., ge=10, le=100)
    gender                 : Literal['Male', 'Female']
    country                : str
    academic_Level         : Literal['Undergraduate', 'Graduate', 'High School']
    most_Used_Platform     : Literal['Facebook', 'LinkedIn', 'Instagram', 'Snapchat', 'Twitter',
       'YouTube', 'TikTok', 'LINE', 'KakaoTalk', 'VKontakte', 'WhatsApp',
       'WeChat']
    purpose_Of_Use         : Literal['Networking', 'Education', 'Entertainment', 'News']
    avg_Daily_Usage_Hours  : float = Field(..., ge=0, le=24)
    daily_Unlocks          : int   = Field(..., ge=0)
    study_Hours            : float = Field(..., ge=0, le=24)
    physical_Activity_Hours: float = Field(..., ge=0, le=24)
    sleep_Hours_Per_Night  : float = Field(..., ge=0, le=24)
    stress_Level           : Literal['Medium', 'Low', 'Very High', 'High']

class PredictionResponse(BaseModel):
    predicted_mental_health_score:float


@app.get("/")
def welcome():
    return {'Always Never Give UP'}

@app.post("/predict", response_model=PredictionResponse)
def predict(data: StudentData):
    country_group = (data.country if data.country in top_countries else 'other')
    input_row = pd.DataFrame([{
        'Age'                           :data.age,
        'Gender'                        :data.gender,
        'Country'                       :data.country,
        'Academic_Level'                :data.academic_Level,
        'Most_Used_Platform'            :data.most_Used_Platform,
        'Purpose_Of_Use'                :data.purpose_Of_Use,
        'Avg_Daily_Usage_Hours'         :data.avg_Daily_Usage_Hours,
        'Daily_Unlocks'                 :data.daily_Unlocks,
        'Study_Hours'                   :data.study_Hours,
        'Physical_Activity_Hours'       :data.physical_Activity_Hours,
        'Sleep_Hours_Per_Night'         :data.sleep_Hours_Per_Night,
        'Stress_Level'                  :data.stress_Level,
        'Group_Country'                 :country_group
    }])

    prediction = model.predict(input_row)[0]
    return PredictionResponse(predicted_mental_health_score=round(float(prediction),2))
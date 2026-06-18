from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import ALLOWED_EXTENSION_ORIGIN
from app.database import create_db_and_tables
from app.routes.comments import router as comments_router
from app.routes.model_options import router as model_options_router
from app.routes.preferences import router as preferences_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


app = FastAPI(title="Threads AI Commenter Backend", version="3.0.0", lifespan=lifespan)

origins = []
if ALLOWED_EXTENSION_ORIGIN:
    origins.append(ALLOWED_EXTENSION_ORIGIN)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(comments_router)
app.include_router(model_options_router)
app.include_router(preferences_router)

"""API v1 router aggregation."""
from fastapi import APIRouter

from app.api.v1 import auth, frameworks, kb, llm, proposals, reviews, templates, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(kb.router)
api_router.include_router(templates.router)
api_router.include_router(proposals.router)
api_router.include_router(frameworks.router)
api_router.include_router(reviews.router)
api_router.include_router(llm.router)

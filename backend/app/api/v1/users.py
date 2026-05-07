"""User-management endpoints (admin) + self-service profile / LLM prefs."""
import logging

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbSession, SuperAdmin
from app.schemas.llm_pref import (
    LLMOptions,
    LLMPreferenceResponse,
    LLMPreferenceUpdate,
    LLMTestRequest,
    LLMTestResponse,
)
from sqlalchemy import desc, func, or_, select

from app.models.audit_event import AuditEvent  # type: ignore[import-not-found]
from app.schemas.user import (
    AdminPasswordResetRequest,
    BulkAction,
    PasswordChangeRequest,
    ProfileUpdate,
    UserAdminResponse,
    UserAuditEvent,
    UserAuditResponse,
    UserCreate,
    UserListResponse,
    UserStats,
    UserUpdate,
)
from app.services import llm_pref_service, ollama_service, user_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["users"])


# -------- self-service (any authenticated user) --------

@router.patch("/me/profile", response_model=UserAdminResponse)
async def update_my_profile(req: ProfileUpdate, db: DbSession, current: CurrentUser):
    return await user_service.update_profile(db, current=current, req=req)


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_my_password(req: PasswordChangeRequest, db: DbSession, current: CurrentUser):
    await user_service.change_password(db, current=current, req=req)


# -------- self-service: LLM preferences --------

@router.get("/me/llm-preferences", response_model=LLMPreferenceResponse)
async def get_my_llm_preferences(db: DbSession, current: CurrentUser):
    pref = await llm_pref_service.get_or_create(db, user=current)
    return LLMPreferenceResponse(
        user_id=pref.user_id,
        model=pref.model,
        options=LLMOptions(**(pref.options or {})),
        updated_at=pref.updated_at,
    )


@router.put("/me/llm-preferences", response_model=LLMPreferenceResponse)
async def update_my_llm_preferences(
    req: LLMPreferenceUpdate, db: DbSession, current: CurrentUser,
):
    pref = await llm_pref_service.upsert(
        db,
        user=current,
        model=req.model,
        options=req.options.model_dump(exclude_none=True),
    )
    return LLMPreferenceResponse(
        user_id=pref.user_id,
        model=pref.model,
        options=LLMOptions(**(pref.options or {})),
        updated_at=pref.updated_at,
    )


@router.post("/me/llm-preferences/test", response_model=LLMTestResponse)
async def test_my_llm_preferences(
    req: LLMTestRequest, db: DbSession, current: CurrentUser,
):
    """One-shot generation against the supplied model + options. Used by the
    Settings UI to verify a configuration before saving."""
    model = (req.model or "").strip() or ollama_service.DEFAULT_MODEL
    options = req.options.model_dump(exclude_none=True)
    try:
        result = await ollama_service.generate(
            req.prompt,
            model=model,
            options=options,
            # Allow plenty of time for cold-start; the user-facing UI shows a spinner.
            timeout_s=300,
        )
    except ollama_service.OllamaError as e:
        raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")
    return LLMTestResponse(
        output=result.output,
        model=result.model,
        duration_ms=result.duration_ms,
    )


# -------- admin --------

admin = APIRouter(prefix="/users", tags=["users-admin"])


@admin.get("", response_model=UserListResponse)
async def list_users(
    db: DbSession,
    _admin: SuperAdmin,
    search: str | None = None,
    role: str = "all",
    status_filter: str = "active",
    limit: int = 100,
    offset: int = 0,
):
    rows, total = await user_service.list_users(
        db,
        search=search,
        role=role,
        status_f=status_filter,
        limit=min(limit, 500),
        offset=max(offset, 0),
    )
    return UserListResponse(
        items=[UserAdminResponse.model_validate(r) for r in rows], total=total
    )


@admin.get("/stats", response_model=UserStats)
async def user_stats(db: DbSession, _admin: SuperAdmin):
    s = await user_service.stats(db)
    return UserStats(**s)


@admin.post("", response_model=UserAdminResponse, status_code=status.HTTP_201_CREATED)
async def create_user(req: UserCreate, db: DbSession, _admin: SuperAdmin):
    return await user_service.create(db, req)


@admin.post("/bulk", response_model=dict)
async def bulk_users(req: BulkAction, db: DbSession, _admin: SuperAdmin):
    affected = await user_service.bulk_update_status(
        db, ids=req.user_ids, action=req.action, actor=_admin
    )
    return {"affected": affected}


@admin.get("/{user_id}", response_model=UserAdminResponse)
async def get_user(user_id: int, db: DbSession, _admin: SuperAdmin):
    # Allow viewing deleted users so admins can review/restore them.
    user = await user_service.get(db, user_id=user_id, include_deleted=True)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@admin.patch("/{user_id}", response_model=UserAdminResponse)
async def update_user(user_id: int, req: UserUpdate, db: DbSession, _admin: SuperAdmin):
    target = await user_service.get(db, user_id=user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    return await user_service.update(db, target=target, req=req)


@admin.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: int, db: DbSession, _admin: SuperAdmin):
    target = await user_service.get(db, user_id=user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if target.id == _admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    await user_service.soft_delete(db, target=target)


@admin.post("/{user_id}/restore", response_model=UserAdminResponse)
async def restore_user(user_id: int, db: DbSession, _admin: SuperAdmin):
    target = await user_service.get(db, user_id=user_id, include_deleted=True)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if target.deleted_at is None:
        raise HTTPException(status_code=400, detail="User is not deleted.")
    return await user_service.restore(db, target=target)


@admin.post("/{user_id}/reset-password", response_model=UserAdminResponse)
async def admin_reset_password(
    user_id: int,
    req: AdminPasswordResetRequest,
    db: DbSession,
    _admin: SuperAdmin,
):
    target = await user_service.get(db, user_id=user_id, include_deleted=True)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    return await user_service.admin_reset_password(db, target=target, req=req)


@admin.get("/{user_id}/audit", response_model=UserAuditResponse)
async def user_audit(
    user_id: int,
    db: DbSession,
    _admin: SuperAdmin,
    limit: int = 50,
    offset: int = 0,
):
    """Audit events related to this user — either as actor OR as target
    (when entity_type='user' and entity_id matches)."""
    target = await user_service.get(db, user_id=user_id, include_deleted=True)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    base = select(AuditEvent).where(
        or_(
            AuditEvent.actor_user_id == user_id,
            (AuditEvent.entity_type == "user") & (AuditEvent.entity_id == str(user_id)),
        )
    )
    total_q = await db.execute(select(func.count()).select_from(base.subquery()))
    total = int(total_q.scalar_one())
    rows_q = await db.execute(
        base.order_by(desc(AuditEvent.occurred_at))
        .limit(min(limit, 200)).offset(max(offset, 0))
    )
    rows = list(rows_q.scalars().all())
    items = [
        UserAuditEvent(
            id=r.id,
            actor_user_id=r.actor_user_id,
            action=r.action,
            entity_type=r.entity_type,
            entity_id=r.entity_id,
            metadata=dict(r.metadata_ or {}),
            ip_address=r.ip_address,
            user_agent=r.user_agent,
            occurred_at=r.occurred_at,
        )
        for r in rows
    ]
    return UserAuditResponse(items=items, total=total)


# Combine into the module-level router so the v1 aggregator gets one router.
router.include_router(admin)

from app.database.base import Base, engine
# Import models so they are registered with Base.metadata
from app import models

def init_db():
    Base.metadata.create_all(bind=engine)
